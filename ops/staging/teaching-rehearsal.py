#!/usr/bin/env python3
"""Check 28081 teaching service wiring and emit the offline rehearsal amendment."""

import argparse
import copy
import json
import re
import sys
from pathlib import Path


PROJECT = 'aisecedu-develop'
HOST_SERVICES = {'app', 'db', 'cache', 'edge'}
TEACHING_NETWORKS = {
    'agent-runtime': {'teaching', 'classroom-render'},
    'courseware-inspector': {'classroom-render'},
    'deepseek-harness': {'teaching'},
}
EDGE_NETWORK = 'classroom-edge'
FIXTURE_URL = 'http://127.0.0.1:3082'
REHEARSAL_ENVIRONMENT = {
    'deepseek-harness': {'DEEPSEEK_BASE_URL': FIXTURE_URL},
    'agent-runtime': {
        'DOJO_AI_ENABLED': 'false',
        'AISECEDU_PUBLIC_ORIGIN': 'http://127.0.0.1:28081',
        'AISECEDU_INTERNAL_URL': 'http://app:8000',
        'HARNESS_INTERNAL_URL': 'http://deepseek-harness:3081',
        'COURSEWARE_INSPECTOR_URL': 'http://courseware-inspector:3015',
    },
    'courseware-inspector': {'COURSEWARE_RENDER_ORIGIN': 'http://agent-runtime:3000/agent-runtime'},
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_config(path):
    # Inspect only already rendered Compose JSON. Never load env_file contents.
    config = json.loads(path.read_text())
    require(isinstance(config, dict) and config.get('name') == PROJECT,
            f'The rendered project must be {PROJECT}')
    return config


def service_networks(service):
    networks = service.get('networks')
    require(isinstance(networks, dict) and networks and not service.get('network_mode'),
            'Expected rendered Compose service networks (no network_mode)')
    return networks


def check_baseline(base):
    services = base['services']
    require(services.keys() == HOST_SERVICES, 'Expected exactly the original app, db, cache and edge services')
    networks = base['networks']
    require(not networks.keys() & {'teaching', 'classroom-render', EDGE_NETWORK, 'model-egress'}
            and 'classroom-data' not in base.get('volumes', {}),
            'The baseline already uses a rehearsal network or volume name')
    for name, service in services.items():
        attached = service_networks(service)
        require(attached.keys() <= networks.keys(), 'Baseline service references an undefined network')
        if name == 'edge':
            ports = service.get('ports', [])
            require(len(ports) == 1 and isinstance(ports[0], dict)
                    and ports[0].get('host_ip') == '127.0.0.1'
                    and str(ports[0].get('published')) == '28081'
                    and ports[0].get('protocol', 'tcp') == 'tcp',
                    'Expected only the edge TCP publication at 127.0.0.1:28081')
        else:
            require(not service.get('ports'), 'Only edge may publish a host port')
            require(all(networks[net].get('internal') is True and not networks[net].get('external')
                        for net in attached), 'App, db and cache must use only internal project networks')
    app_networks = service_networks(services['app'])
    for dependency in ('db', 'cache', 'edge'):
        require(app_networks.keys() & service_networks(services[dependency]).keys(),
                'App must share an existing network with db, cache and edge')


def additions(edge):
    return {'app': 'teaching', 'edge': EDGE_NETWORK} if edge else {'app': 'teaching'}


def render_amendment(edge):
    lines = ['# Load after teaching-app.compose.yml for rehearsal only.', 'services:']
    if edge:
        lines.extend(('  edge:', f'    networks: {{{EDGE_NETWORK}: {{}}}}'))
    lines.extend(('  deepseek-harness:', '    networks: !override [teaching]',
                  '    environment:', f'      DEEPSEEK_BASE_URL: "{FIXTURE_URL}"',
                  '  agent-runtime:', '    environment:', '      DOJO_AI_ENABLED: "false"'))
    if edge:
        lines.append(f'    networks: {{{EDGE_NETWORK}: {{}}}}')
    lines.extend(('networks:', '  model-egress: !reset null'))
    if edge:
        lines.extend((f'  {EDGE_NETWORK}:', '    internal: true'))
    return '\n'.join(lines) + '\n'


def remove_host_attachments(services, expected):
    for service, network in expected.items():
        attached = service_networks(services[service])
        require(network in attached and attached.pop(network) in ({}, None),
                'Missing or altered host integration network attachment')


def check_teaching_service(name, service, expected_networks):
    attached = service_networks(service)
    require(attached.keys() == expected_networks and all(value in ({}, None) for value in attached.values()),
            'Unexpected teaching service network attachment')
    require(not any(service.get(key) for key in ('ports', 'external_links', 'links', 'extra_hosts',
                                                 'privileged', 'devices', 'build', 'pid', 'ipc',
                                                 'volumes_from', 'use_api_socket', 'cap_add')),
            'Unexpected teaching service host access or alternate endpoint')
    require(service.get('pull_policy') == 'never' and service.get('read_only') is True
            and re.fullmatch(r'sha256:[0-9a-f]{64}|[^\s@]+@sha256:[0-9a-f]{64}', service.get('image', '')),
            'Teaching services require read-only containers and verified immutable images')
    expected_mount = [{'type': 'volume', 'source': 'classroom-data', 'target': '/app/data'}]
    require([{key: mount.get(key) for key in ('type', 'source', 'target')} for mount in service.get('volumes', [])]
            == (expected_mount if name == 'agent-runtime' else []), 'Unexpected teaching service volume')


def check_internal_bridge(network, name):
    require(network.get('internal') is True and network.get('name') == f'{PROJECT}_{name}'
            and not network.get('ipam') and network.get('driver', 'bridge') == 'bridge'
            and network.keys() <= {'internal', 'name', 'ipam', 'driver'},
            'Teaching networks must be isolated project-local bridges')


def check_candidate(base, candidate, edge):
    original = copy.deepcopy(candidate)
    services = original['services']
    require(services.keys() == HOST_SERVICES | TEACHING_NETWORKS.keys(),
            'Expected the four host services plus DSH, classroom and inspector')
    remove_host_attachments(services, additions(edge))
    for name, expected in TEACHING_NETWORKS.items():
        service = services.pop(name)
        if name == 'agent-runtime' and edge:
            expected = expected | {EDGE_NETWORK}
        check_teaching_service(name, service, expected)
        environment = service.get('environment', {})
        require(all(environment.get(key) == value for key, value in REHEARSAL_ENVIRONMENT[name].items()),
                'Unexpected classroom endpoints, AI setting or DSH loopback fixture')
    new_networks = {'teaching', 'classroom-render'} | ({EDGE_NETWORK} if edge else set())
    for name in new_networks:
        check_internal_bridge(original['networks'].pop(name, {}), name)
    volume = original['volumes'].pop('classroom-data', {})
    require(volume == {'name': f'{PROJECT}_classroom-data'}, 'Unexpected classroom data volume')
    if 'volumes' not in base and not original['volumes']:
        del original['volumes']
    require(original == base,
            'Candidate changes the original host configuration or adds resources outside rehearsal')


def check_app_connection(reference, candidate):
    services = reference['services']
    require(services.keys() == HOST_SERVICES | TEACHING_NETWORKS.keys(),
            'Expected the four host services plus DSH, classroom and inspector')
    networks = reference['networks']
    check_baseline({
        'services': {name: services[name] for name in HOST_SERVICES},
        'networks': {name: config for name, config in networks.items()
                     if name not in {'teaching', 'classroom-render', 'model-egress'}},
        'volumes': {name: config for name, config in reference.get('volumes', {}).items()
                    if name != 'classroom-data'},
    })
    for name in ('teaching', 'classroom-render'):
        check_internal_bridge(networks[name], name)
    for name, expected in TEACHING_NETWORKS.items():
        if name == 'deepseek-harness' and 'model-egress' in networks:
            expected = expected | {'model-egress'}
        check_teaching_service(name, services[name], expected)
    original = copy.deepcopy(candidate)
    remove_host_attachments(original['services'], {'app': 'teaching'})
    require(original == reference, 'App connection changed more than its teaching network attachment')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--edge', action='store_true', help='Allow edge to reach classroom on a separate private network')
    parser.add_argument('--check-app-connection', action='store_true',
                        help='Verify the only change to the rendered reference is the app teaching attachment')
    parser.add_argument('base', type=Path, help='Rendered baseline or reference, before the amendment')
    parser.add_argument('candidate', nargs='?', type=Path, help='Rendered merged JSON to validate instead of printing the amendment')
    args = parser.parse_args()
    if args.check_app_connection and (args.edge or args.candidate is None):
        parser.error('--check-app-connection requires two rendered configs and does not take --edge')
    try:
        base = load_config(args.base)
        if args.check_app_connection:
            check_app_connection(base, load_config(args.candidate))
            print('Verified 28081 app teaching network attachment')
        elif args.candidate is None:
            check_baseline(base)
            print(render_amendment(args.edge), end='')
        else:
            check_baseline(base)
            check_candidate(base, load_config(args.candidate), args.edge)
            print('Verified static 28081 rehearsal configuration')
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        # Never echo the config or unexpected field values from operational input.
        reason = str(exc) if type(exc) is ValueError else 'invalid rendered Compose JSON or structure'
        parser.exit(1, f'Teaching rehearsal: {reason}\n')


if __name__ == '__main__':
    main()
