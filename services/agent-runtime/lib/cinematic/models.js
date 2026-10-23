(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var kinds = ['turbine', 'server-rack', 'processor', 'memory-bank', 'dna', 'atom', 'planet', 'satellite', 'optical-bench', 'wave-surface', 'valve', 'pipe-assembly', 'circuit-board', 'logic-stack', 'usb-drive', 'computer-workstation', 'industrial-controller', 'industrial-drive', 'centrifuge-housing'];
  function numeric(type, value, min, max) { return { type: type, default: value, min: min, max: max }; }
  var commonParams = { detail: numeric('integer', 2, 1, 3), speed: numeric('number', 1, -5, 5) };
  var definitions = {
    turbine: { parameters: { blades: numeric('integer', 24, 12, 36), rpm: numeric('number', 18, -120, 120) }, roles: ['rotating-machinery', 'sectioned-assembly'], representation: 'Sectioned axial compressor/turbine; not a valve or a calibrated process simulation.' },
    'server-rack': { parameters: { units: numeric('integer', 8, 4, 12) }, roles: ['equipment-enclosure', 'rack-mounted-modules'], representation: 'Rack with hot-swap trays and fans; not an instrument display or a fluid component.' },
    processor: { parameters: { lid: { type: 'boolean', default: false } }, roles: ['processor-package', 'layered-semiconductor'], representation: 'Illustrative processor package with perimeter leads, not a bottom-contact LGA package or a pin-matched socket interface. Existing package layers separate together under global explode; decorative signals do not execute instructions.' },
    'memory-bank': { parameters: { modules: numeric('integer', 4, 2, 6) }, roles: ['dimm-array', 'physical-memory-hardware'], representation: 'Multi-DIMM assembly with its own base and sockets. Retaining clips are fixed geometry with no open/close motion. Global explode separates the DIMM boards, not individual clips or a single DIMM insertable into an arbitrary external slot. Not addressable memory cells, registers, or a logical call frame.' },
    dna: { parameters: { basePairs: numeric('integer', 28, 12, 40), turns: numeric('number', 2.45, 1, 4), separation: { type: 'enum', default: 'whole', values: ['whole', 'local'] }, separationCenter: numeric('number', 0.5, 0.2, 0.8), separationSpan: numeric('number', 0.4, 0.15, 0.6) }, roles: ['double-helix', 'molecular-context'], representation: 'Right-handed symmetric teaching double helix with repeated base-pair rungs and two backbones. With separation=whole (default), explode separates the two whole strands. With separation=local, explode 0..1 smoothly opens only a bounded region around separationCenter (height fraction 0..1), of width separationSpan: both continuous helical backbones and their attached complementary base halves move radially apart there; outside this region stays paired and fixed. Animate explode 0→1→0 for local opening and re-pairing on the SAME molecule, without overlay copies. Set speed=0 for a stationary teaching view. This is qualitative local separation, not replication, enzymatic unwinding or a bond-energy simulation. Colors/beads are explanatory, not atoms or measured sequence; no calibrated groove widths or base-pairs-per-turn.' },
    atom: { parameters: { electrons: numeric('integer', 5, 2, 8), nucleons: numeric('integer', 25, 8, 48) }, roles: ['conceptual-atomic-structure'], representation: 'Conceptual orbital guides, not electron trajectories or a quantum solution.' },
    planet: { parameters: { seed: numeric('number', 3, -100, 100), waterLevel: numeric('number', 0.035, -0.35, 0.35), rings: { type: 'boolean', default: true } }, roles: ['fictional-planet', 'planetary-surface-context'], representation: 'Fictional procedural surface; not geographic imagery or an orbital solver.' },
    satellite: { parameters: {}, roles: ['spacecraft-assembly', 'solar-array', 'antenna'], representation: 'Illustrative spacecraft assembly, not engineering dimensions or a dynamics solver.' },
    'optical-bench': { parameters: { wavelength: numeric('number', 0.55, 0.2, 2), slitSeparation: numeric('number', 0.21, 0.12, 0.45), beam: { type: 'boolean', default: true } }, roles: ['optical-experiment', 'double-slit'], representation: 'Qualitative interference, not calibrated laboratory predictions.' },
    'wave-surface': { parameters: { amplitude: numeric('number', 0.18, 0.025, 0.34), wavelength: numeric('number', 0.73, 0.28, 1.8), frequency: numeric('number', 0.75, 0.1, 3), separation: numeric('number', 1.15, 0.35, 2.3), mode: { type: 'enum', default: 'double', values: ['plane', 'single', 'double'] } }, roles: ['qualitative-wave-field'], representation: 'Qualitative wave-height visualization; not a physical field solver.' },
    valve: { parameters: { opening: numeric('number', 0.65, 0, 1), actuator: { type: 'enum', default: 'electric', values: ['electric', 'manual'] } }, roles: ['inline-flow-control', 'valve-body', 'actuator'], representation: 'Sectioned valve with body, obturator, stem and actuator; opening is a geometric setting, not a flow calculation.' },
    'pipe-assembly': { parameters: { layout: { type: 'enum', default: 'elbow', values: ['straight', 'elbow', 'u'] }, length: numeric('number', 4, 2, 6), radius: numeric('number', 0.14, 0.08, 0.24) }, roles: ['physical-fluid-conduit', 'flanged-connection', 'supported-pipe'], representation: 'Hollow pipe with flange faces and supports; no implied fluid solver.' },
    'circuit-board': { parameters: { width: numeric('number', 5.4, 3.8, 7), depth: numeric('number', 3.6, 3, 5), slots: numeric('integer', 3, 2, 5) }, roles: ['hardware-support', 'pcb-interconnect', 'component-sockets'], representation: 'Illustrative PCB whose board, socket contacts, DIMM slots, retaining clips and copper traces form one fixed assembly. No internal layer separation, clip opening/closing or individually animated built-in trace segments; not a fabricated electrical design or a validated mating interface.' },
    'logic-stack': { parameters: { layers: numeric('integer', 4, 2, 6), columns: numeric('integer', 4, 2, 8), rows: numeric('integer', 2, 1, 4), activeLayer: numeric('integer', 1, 1, 6), activeCell: numeric('integer', 1, 1, 32) }, roles: ['logical-layered-storage', 'partitioned-teaching-diagram', 'marker-slots'], representation: 'Partitioned logical teaching layers; explicitly not physical RAM, DIMMs, or real memory addresses. layers/columns/rows/activeLayer/activeCell are static construction parameters. Global explode separates existing layers together; it does not push/pop call frames or change active cells. Changing logical markers require separate scene nodes and actual tracks.' },
    'usb-drive': { parameters: {}, roles: ['removable-storage-device'], representation: 'USB-shaped removable storage with molded body, metal plug, recessed tongue and contact details. No stored data or automatic transfer; animate the complete root for carrying/insertion and use separate conceptual signal entities. Connector port is the physical plug tip, not its center.' },
    'computer-workstation': { parameters: { tower: { type: 'boolean', default: true } }, roles: ['desktop-computer', 'operator-workstation'], representation: 'Detailed monitor, pedestal, keyboard, mouse and optional desktop tower. Screen faces +Z. Screen is a dark blank physical surface; add an explicitly authored surfaceText plane at display port for readable content. Never claim built-in live numbers, OS execution or changing screen content. USB port is on the front of the tower (tower=true) or monitor edge (tower=false).' },
    'industrial-controller': { parameters: { modules: numeric('integer', 4, 2, 6) }, roles: ['modular-industrial-controller'], representation: 'Generic modular industrial controller on a rail, with separate module shells, repeated terminal screws, socket and status lenses. Not a server rack, processor package, physical memory map or executable PLC. Hardware is fixed; conceptual control-logic changes must be separate visible scene entities in front of the controller, not hidden inside the closed module shells. No actual vendor, wiring specification or operating parameters.' },
    'industrial-drive': { parameters: {} , roles: ['industrial-motor-drive'], representation: 'Generic drive enclosure with heatsink fins, terminal block, keypad and static display scale. No actual operating parameters or built-in dynamic readings. Overlay explicitly generated surfaceText or a separate visible pointer at display port; changing emissive brightness does not change a reading.' },
    'centrifuge-housing': { parameters: { cutaway: { type: 'boolean', default: true } }, roles: ['vertical-rotor-machine-housing', 'centrifuge-teaching-enclosure'], representation: 'Illustrative tall vertical rotor-machine casing, bearing collars, motor housing, fins, bolts and feet; not a turbine and not a calibrated industrial design. NO internal spinning rotor is included. Add a separate visible cylindrical rotor with an asymmetric longitudinal stripe and actual Y-rotation track, centered at rotor-center port. cutaway=true opens the front (+Z) half and corresponding collars for observation. Determine usable cavity from actual port positions and catalog bounds; do not infer physical dimensions, enrichment performance or operating speeds. All built-in parts remain fixed.' }
  };

  function definition(kind) {
    if (!Object.prototype.hasOwnProperty.call(definitions, kind)) throw new RangeError('Unknown cinematic model: ' + kind);
    var value = definitions[kind];
    return { kind: kind, parameters: JSON.parse(JSON.stringify(Object.assign({}, commonParams, value.parameters))), roles: value.roles.slice(), representation: value.representation };
  }

  function normalizeParams(kind, input) {
    var params = {}, rules = definition(kind).parameters;
    Object.keys(rules).forEach(function (key) {
      var rule = rules[key], value = input && input[key];
      if (rule.type === 'boolean') params[key] = typeof value === 'boolean' ? value : rule.default;
      else if (rule.type === 'enum') params[key] = rule.values.indexOf(value) >= 0 ? value : rule.default;
      else {
        value = typeof value === 'number' && Number.isFinite(value) ? clamp(value, rule.min, rule.max) : rule.default;
        params[key] = rule.type === 'integer' ? Math.round(value) : value;
      }
    });
    if (kind === 'logic-stack') {
      params.activeLayer = Math.min(params.layers, params.activeLayer);
      params.activeCell = Math.min(params.rows * params.columns, params.activeCell);
    }
    return params;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function number(params, name, fallback, minimum, maximum) {
    var value = params[name];
    return typeof value === 'number' && Number.isFinite(value) ? clamp(value, minimum, maximum) : fallback;
  }

  function hex(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  function context(T, spec) {
    var root = new T.Group();
    var fit = new T.Group();
    var body = new T.Group();
    var geometries = new Map();
    var materials = new Set();
    var textures = new Set();
    var instancedMeshes = new Set();
    var displacements = [];
    var deformations = [];
    var animations = [];
    var portAnchors = new Map();
    var supportMeshes = new Map();
    var motionBounds = new Map();
    var movingBounds = new Map();
    var time = 0;
    var exploded = 0;
    var resourcesDisposed = false;
    var params = normalizeParams(spec.model, spec.params);
    var color = hex(spec.color, '#829cb3');
    var accent = hex(spec.accent, '#64e8ee');
    var detail = Math.round(number(params, 'detail', 2, 1, 3));
    var dummy = new T.Object3D();
    root.name = 'cinematic:' + spec.model;
    fit.name = 'normalized-model';
    body.name = 'assembly';
    root.add(fit);
    fit.add(body);

    function geometry(key, make) {
      if (!geometries.has(key)) geometries.set(key, make());
      return geometries.get(key);
    }

    function standard(tint, metalness, roughness, extra) {
      var material = new T.MeshStandardMaterial(Object.assign({ color: tint, metalness: metalness, roughness: roughness }, extra || {}));
      materials.add(material);
      return material;
    }

    function shader(options) {
      var material = new T.ShaderMaterial(Object.assign({}, options, {
        uniforms: Object.assign({}, options.uniforms, { uOpacity: { value: options.opacity === undefined ? 1 : options.opacity } }),
        fragmentShader: 'uniform float uOpacity;\n' + options.fragmentShader.replace(/\}\s*$/, 'gl_FragColor.a *= uOpacity;\n}')
      }));
      materials.add(material);
      return material;
    }

    function glow(tint, strength, opacity) {
      return standard(tint, 0.15, 0.32, {
        emissive: tint,
        emissiveIntensity: strength,
        transparent: opacity !== undefined && opacity < 1,
        opacity: opacity === undefined ? 1 : opacity,
        depthWrite: opacity === undefined || opacity >= 1
      });
    }

    function texture(data, width, height, srgb) {
      var result = new T.DataTexture(data, width, height, T.RGBAFormat);
      result.encoding = srgb ? T.sRGBEncoding : T.LinearEncoding;
      result.magFilter = T.LinearFilter;
      result.minFilter = T.LinearMipmapLinearFilter;
      result.generateMipmaps = true;
      result.anisotropy = 4;
      result.needsUpdate = true;
      textures.add(result);
      return result;
    }

    function part(parent, name, position, displacement) {
      var group = new T.Group();
      group.name = name;
      if (position) group.position.fromArray(position);
      parent.add(group);
      if (displacement) explode(group, displacement);
      return group;
    }

    function port(parent, id, position, normal, role) {
      if (portAnchors.has(id)) throw new Error('Duplicate model port: ' + id);
      var anchor = part(parent, 'port:' + id, position);
      portAnchors.set(id, { object: anchor, normal: new T.Vector3().fromArray(normal).normalize(), role: role, part: parent.name });
      return anchor;
    }

    function motion(object, axis, maxScale) {
      motionBounds.set(object, { axis: axis, maxScale: maxScale || 1 });
    }

    function supportSurface(id, object) {
      if (supportMeshes.has(id)) throw new Error('Duplicate support surface: ' + id);
      supportMeshes.set(id, object);
      return object;
    }

    function movingPoints(object, positions, radius) {
      var bounds = new T.Box3().setFromPoints(positions.map(function (v) { return new T.Vector3().fromArray(v); }));
      bounds.expandByScalar(radius);
      movingBounds.set(object, bounds);
    }

    // A bounded, reversible deformation driven by the existing explode channel.
    // Both rendering and catalog framing use the same closed/open envelope.
    function explodeDeformation(object, positions, animate) {
      movingPoints(object, positions, 0);
      deformations.push(object);
      animations.push(function (_, amount) { animate(amount); });
    }

    function explode(object, displacement) {
      displacements.push({ object: object, position: object.position.clone(), displacement: new T.Vector3().fromArray(displacement) });
    }

    function mesh(parent, shape, material, position, rotation, scale) {
      var object = new T.Mesh(shape, material);
      if (position) object.position.fromArray(position);
      if (rotation) object.rotation.set(rotation[0], rotation[1], rotation[2]);
      if (scale) object.scale.fromArray(scale);
      object.castShadow = !material.transparent;
      object.receiveShadow = !material.transparent;
      parent.add(object);
      return object;
    }

    function matrix(item) {
      dummy.position.fromArray(item.p || [0, 0, 0]);
      dummy.rotation.set(0, 0, 0);
      if (item.r) dummy.rotation.set(item.r[0], item.r[1], item.r[2]);
      if (item.q) dummy.quaternion.copy(item.q);
      dummy.scale.fromArray(item.s || [1, 1, 1]);
      dummy.updateMatrix();
      return dummy.matrix;
    }

    function batch(parent, shape, material, items, dynamic) {
      if (!items.length) return null;
      var object = new T.InstancedMesh(shape, material, items.length);
      instancedMeshes.add(object);
      items.forEach(function (item, index) {
        object.setMatrixAt(index, matrix(item));
        if (item.color) object.setColorAt(index, new T.Color(item.color));
      });
      object.instanceMatrix.needsUpdate = true;
      if (object.instanceColor) object.instanceColor.needsUpdate = true;
      if (dynamic) object.instanceMatrix.setUsage(T.DynamicDrawUsage);
      // r150 does not compute an InstancedMesh bound from its instance matrices.
      object.frustumCulled = false;
      object.castShadow = !material.transparent;
      object.receiveShadow = !material.transparent;
      parent.add(object);
      return object;
    }

    function roundedBox(width, height, depth, radius) {
      radius = Math.min(radius === undefined ? 0.035 : radius, width * 0.2, height * 0.2, depth * 0.2);
      return geometry('bevel:' + [width, height, depth, radius].join(':'), function () {
        var x = width / 2 - radius;
        var y = height / 2 - radius;
        var r = radius * 0.45;
        var shape = new T.Shape();
        shape.moveTo(-x + r, -y);
        shape.lineTo(x - r, -y);
        shape.quadraticCurveTo(x, -y, x, -y + r);
        shape.lineTo(x, y - r);
        shape.quadraticCurveTo(x, y, x - r, y);
        shape.lineTo(-x + r, y);
        shape.quadraticCurveTo(-x, y, -x, y - r);
        shape.lineTo(-x, -y + r);
        shape.quadraticCurveTo(-x, -y, -x + r, -y);
        var result = new T.ExtrudeGeometry(shape, { depth: depth - 2 * radius, steps: 1, bevelEnabled: true, bevelSize: radius, bevelThickness: radius, bevelSegments: 2, curveSegments: 3 });
        result.translate(0, 0, -depth / 2 + radius);
        return result;
      });
    }

    function box(parent, width, height, depth, material, position, radius) {
      return mesh(parent, roundedBox(width, height, depth, radius), material, position);
    }

    function unitBox() {
      return geometry('unit-box', function () { return new T.BoxGeometry(1, 1, 1); });
    }

    function sphere(radius) {
      return geometry('sphere:' + radius, function () { return new T.SphereGeometry(radius, 12 + detail * 4, 8 + detail * 2); });
    }

    function cylinder(radius, height, topRadius, segments) {
      if (topRadius === undefined) topRadius = radius;
      segments = segments || 16 + detail * 8;
      return geometry('cylinder:' + [radius, height, topRadius, segments].join(':'), function () { return new T.CylinderGeometry(topRadius, radius, height, segments); });
    }

    function ring(parent, radius, thickness, material, position, rotation) {
      var shape = geometry('torus:' + radius + ':' + thickness, function () { return new T.TorusGeometry(radius, thickness, 6 + detail * 2, 32 + detail * 16); });
      return mesh(parent, shape, material, position, rotation);
    }

    function rodItem(a, b, radius, tint) {
      var start = new T.Vector3().fromArray(a);
      var end = new T.Vector3().fromArray(b);
      var direction = end.clone().sub(start);
      return { p: start.add(end).multiplyScalar(0.5).toArray(), s: [radius, direction.length(), radius], q: new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()), color: tint };
    }

    function rods(parent, material, items) {
      return batch(parent, cylinder(1, 1, 1, 8), material, items);
    }

    function tube(parent, points, radius, material, closed) {
      var curve = new T.CatmullRomCurve3(points.map(function (point) { return new T.Vector3().fromArray(point); }), !!closed);
      var shape = new T.TubeGeometry(curve, clamp(points.length * 3, 24, 160), radius, 6 + detail * 2, !!closed);
      geometries.set(shape.uuid, shape);
      return mesh(parent, shape, material);
    }

    var palette = {
      metal: standard(color, 0.72, 0.39),
      silver: standard('#bac8d2', 0.85, 0.3),
      dark: standard('#172635', 0.3, 0.51),
      black: standard('#101720', 0.02, 0.68),
      gold: standard('#cda157', 0.8, 0.33),
      ceramic: standard('#d3dddd', 0.02, 0.46),
      light: glow(accent, 1.65),
      warm: glow('#ffac61', 1.1)
    };

    function envelope(object) {
      if (movingBounds.has(object)) return movingBounds.get(object).clone();
      var result = new T.Box3(), matrix = new T.Matrix4();
      if (object.isMesh) {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        if (object.isInstancedMesh) {
          for (var i = 0; i < object.count; i++) {
            object.getMatrixAt(i, matrix);
            result.union(object.geometry.boundingBox.clone().applyMatrix4(matrix));
          }
        } else result.copy(object.geometry.boundingBox);
      }
      object.children.forEach(function (child) { result.union(envelope(child)); });
      if (result.isEmpty()) return result;
      var rotation = object.rotation.clone(), scale = object.scale.clone(), moving = motionBounds.get(object);
      if (moving) {
        scale.multiplyScalar(moving.maxScale);
        if (moving.axis) {
          result.min.multiply(scale); result.max.multiply(scale); scale.set(1, 1, 1);
          var indices = moving.axis === 'x' ? ['y', 'z'] : moving.axis === 'y' ? ['x', 'z'] : ['x', 'y'];
          var a = Math.max(Math.abs(result.min[indices[0]]), Math.abs(result.max[indices[0]]));
          var b = Math.max(Math.abs(result.min[indices[1]]), Math.abs(result.max[indices[1]]));
          var radius = Math.hypot(a, b);
          indices.forEach(function (axis) { result.min[axis] = -radius; result.max[axis] = radius; });
          rotation[moving.axis] = 0;
        }
      }
      matrix.compose(object.position, new T.Quaternion().setFromEuler(rotation), scale);
      result.applyMatrix4(matrix);
      displacements.forEach(function (entry) {
        if (entry.object !== object) return;
        // Assembly displacement is in the parent frame, not the rotated part frame.
        result.union(result.clone().translate(entry.displacement));
      });
      return result;
    }

    function boundsData(box) {
      return { min: box.min.toArray(), max: box.max.toArray(), radius: Math.hypot(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), Math.max(Math.abs(box.min.y), Math.abs(box.max.y)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z))) };
    }

    var rootInverse = new T.Matrix4(), relative = new T.Matrix4(), normalMatrix = new T.Matrix3();
    function updatePorts() {
      root.updateMatrixWorld(true);
      rootInverse.copy(root.matrixWorld).invert();
      portAnchors.forEach(function (entry, id) {
        relative.multiplyMatrices(rootInverse, entry.object.matrixWorld);
        var position = new T.Vector3().setFromMatrixPosition(relative);
        var normal = entry.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(relative)).normalize();
        var ancestor = entry.object, dynamic = false;
        while (ancestor && ancestor !== root) {
          if (motionBounds.has(ancestor) || movingBounds.has(ancestor) || displacements.some(function (d) { return d.object === ancestor; })) dynamic = true;
          ancestor = ancestor.parent;
        }
        root.userData.ports[id] = { position: position.toArray(), normal: normal.toArray(), role: entry.role, part: entry.part, dynamic: dynamic };
      });
    }

    function apply() {
      displacements.forEach(function (entry) { entry.object.position.copy(entry.position).addScaledVector(entry.displacement, exploded); });
      animations.forEach(function (animate) { animate(time, exploded); });
    }

    function finish() {
      apply();
      root.updateMatrixWorld(true);
      var bounds = new T.Box3();
      var instance = new T.Matrix4();
      var world = new T.Matrix4();
      var point = new T.Vector3();
      var pieces = [];
      var triangleCount = 0;
      var drawCalls = 0;
      var instances = 0;
      function visit(piece, consume) {
        var shape = piece.shape;
        if (shape.userData.displacedBounds) {
          for (var corner = 0; corner < 8; corner++) {
            var minimum = shape.boundingBox.min, maximum = shape.boundingBox.max;
            point.set(corner & 1 ? maximum.x : minimum.x, corner & 2 ? maximum.y : minimum.y, corner & 4 ? maximum.z : minimum.z).applyMatrix4(piece.matrix);
            consume(point);
          }
        } else {
          var positions = shape.attributes.position;
          for (var vertex = 0; vertex < positions.count; vertex++) consume(point.fromBufferAttribute(positions, vertex).applyMatrix4(piece.matrix));
        }
      }
      root.traverse(function (object) {
        if (!object.isMesh) return;
        var shape = object.geometry;
        if (!shape.boundingBox) shape.computeBoundingBox();
        var count = object.isInstancedMesh ? object.count : 1;
        for (var index = 0; index < count; index++) {
          if (object.isInstancedMesh) {
            object.getMatrixAt(index, instance);
            world.multiplyMatrices(object.matrixWorld, instance);
          } else world.copy(object.matrixWorld);
          var piece = { shape: shape, matrix: world.clone() };
          pieces.push(piece);
          visit(piece, function (vertex) { bounds.expandByPoint(vertex); });
        }
        triangleCount += (shape.index ? shape.index.count : shape.attributes.position.count) / 3 * count;
        drawCalls += Array.isArray(object.material) ? shape.groups.length : 1;
        if (object.material.transparent && object.material.side === T.DoubleSide && !object.material.forceSinglePass) drawCalls++;
        instances += count;
      });
      var center = bounds.getCenter(new T.Vector3());
      var size = bounds.getSize(new T.Vector3());
      var radiusSquared = 0.000001;
      pieces.forEach(function (piece) { visit(piece, function (vertex) { radiusSquared = Math.max(radiusSquared, vertex.distanceToSquared(center)); }); });
      var normalization = 2.15 / Math.sqrt(radiusSquared);
      body.position.copy(center).multiplyScalar(-1);
      fit.scale.setScalar(normalization);
      root.userData.model = spec.model;
      root.userData.radius = 2.15;
      root.userData.size = size.multiplyScalar(normalization).toArray();
      root.userData.bounds = boundsData(bounds.clone().applyMatrix4(new T.Matrix4().makeScale(normalization, normalization, normalization).multiply(new T.Matrix4().makeTranslation(-center.x, -center.y, -center.z))));
      root.userData.bounds.radius = 2.15;
      root.userData.expandedBounds = boundsData(envelope(fit));
      root.userData.floor = root.userData.bounds.min[1];
      root.userData.ports = Object.create(null);
      root.userData.params = params;
      root.userData.supportsExplode = displacements.length > 0 || deformations.length > 0 || Array.from(motionBounds.values()).some(function (motion) { return motion.maxScale > 1; });
      var explodeParts = new Set();
      function recordExplodePart(object) {
        while (object !== body && !object.name) object = object.parent;
        explodeParts.add(object.name);
      }
      displacements.forEach(function (entry) { if (entry.displacement.lengthSq() > 0) recordExplodePart(entry.object); });
      motionBounds.forEach(function (motion, object) { if (motion.maxScale > 1) recordExplodePart(object); });
      deformations.forEach(recordExplodePart);
      root.userData.explodeParts = Array.from(explodeParts);
      root.userData.internalPartsAddressable = false;
      root.userData.parameterMode = 'construction-only';
      root.userData.assemblyValidation = 'placement-only';
      root.userData.stats = { drawCalls: drawCalls, triangles: Math.round(triangleCount), instances: instances, geometries: geometries.size, materials: materials.size, textures: textures.size };
      root.userData.stats.geometryBytes = 0;
      geometries.forEach(function (shape) {
        Object.keys(shape.attributes).forEach(function (key) { root.userData.stats.geometryBytes += shape.attributes[key].array.byteLength; });
        if (shape.index) root.userData.stats.geometryBytes += shape.index.array.byteLength;
      });
      instancedMeshes.forEach(function (object) {
        root.userData.stats.geometryBytes += object.instanceMatrix.array.byteLength;
        if (object.instanceColor) root.userData.stats.geometryBytes += object.instanceColor.array.byteLength;
      });
      root.userData.stats.textureBytes = 0;
      textures.forEach(function (map) { root.userData.stats.textureBytes += Math.ceil(map.image.data.byteLength * (map.generateMipmaps ? 4 / 3 : 1)); });
      root.userData.update = function (seconds, amount) {
        time = typeof seconds === 'number' && Number.isFinite(seconds) ? clamp(seconds, -1e7, 1e7) : 0;
        if (typeof amount === 'number' && Number.isFinite(amount)) exploded = clamp(amount, 0, 1);
        apply();
        updatePorts();
      };
      root.userData.setExplode = function (amount) {
        exploded = typeof amount === 'number' && Number.isFinite(amount) ? clamp(amount, 0, 1) : 0;
        apply();
        updatePorts();
      };
      root.userData.dispose = function () {
        if (resourcesDisposed) return;
        resourcesDisposed = true;
        geometries.forEach(function (shape) { shape.dispose(); });
        materials.forEach(function (material) { material.dispose(); });
        textures.forEach(function (map) { map.dispose(); });
        instancedMeshes.forEach(function (object) { if (object.dispose) object.dispose(); });
      };
      root.updateMatrixWorld(true);
      updatePorts();
      root.userData.supportSurfaces = Array.from(supportMeshes, function (entry) {
        var bounds = new T.Box3().setFromObject(entry[1]);
        return { id: entry[0], bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, coordinateSpace: 'normalized-root', state: 'initial-assembled', dynamic: false };
      });
      return root;
    }

    return { T: T, root: root, body: body, params: params, metadataOnly: spec.metadataOnly === true, color: color, accent: accent, detail: detail, palette: palette, geometry: geometry, standard: standard, shader: shader, glow: glow, texture: texture, part: part, port: port, supportSurface: supportSurface, motion: motion, movingPoints: movingPoints, explode: explode, explodeDeformation: explodeDeformation, mesh: mesh, batch: batch, matrix: matrix, roundedBox: roundedBox, unitBox: unitBox, box: box, sphere: sphere, cylinder: cylinder, ring: ring, rods: rods, rodItem: rodItem, tube: tube, animate: function (fn) { animations.push(fn); }, finish: finish };
  }

  function turbine(c) {
    var T = c.T, p = c.palette;
    var blades = Math.round(number(c.params, 'blades', 24, 12, 36));
    var speed = number(c.params, 'rpm', 18, -120, 120) * TAU / 60 * number(c.params, 'speed', 1, -5, 5);
    var rotor = c.part(c.body, 'rotating-shaft-and-compressor');
    var casing = c.part(c.body, 'sectioned-pressure-casing', [0, 0, 0], [0, 0.7, -0.3]);
    var shell = c.geometry('turbine-shell', function () {
      return new T.LatheGeometry([[1.43, -0.83], [1.52, -0.88], [1.57, -0.8], [1.57, 0.7], [1.52, 0.8], [1.43, 0.8], [1.43, -0.83]].map(function (v) { return new T.Vector2(v[0], v[1]); }), 48 + c.detail * 8, 0.22 * Math.PI, 1.52 * Math.PI);
    });
    c.mesh(casing, shell, p.metal, [0, 0, -0.06], [Math.PI / 2, 0, 0]);
    [-0.87, 0.78].forEach(function (z) {
      c.ring(casing, 1.5, 0.073, p.silver, [0, 0, z]);
      c.ring(casing, 1.56, 0.014, p.gold, [0, 0, z]);
    });
    var ribs = [];
    for (var rib = 0; rib < 14; rib++) {
      var angle = 0.23 * Math.PI + rib / 13 * 1.49 * Math.PI;
      ribs.push(c.rodItem([Math.sin(angle) * 1.57, -Math.cos(angle) * 1.57, -0.79], [Math.sin(angle) * 1.57, -Math.cos(angle) * 1.57, 0.7], 0.019));
    }
    c.rods(casing, p.dark, ribs);
    c.mesh(rotor, c.cylinder(0.18, 2.65), p.silver, [0, 0, 0], [Math.PI / 2, 0, 0]);
    var blade = c.geometry('swept-airfoil', function () {
      var positions = [], indices = [];
      var rows = 6 + c.detail * 2, columns = 12;
      for (var row = 0; row <= rows; row++) {
        var u = row / rows;
        var radius = 0.39 + u * 0.99;
        var chord = 0.38 - u * 0.15;
        var twist = 0.7 - u * 1.05;
        for (var column = 0; column < columns; column++) {
          var a = column / columns * TAU;
          var x = Math.cos(a) * chord * 0.5;
          var z = Math.sin(a) * (0.033 - u * 0.018);
          positions.push(x * Math.cos(twist) - z * Math.sin(twist) + 0.21 * u * u, radius, x * Math.sin(twist) + z * Math.cos(twist) - 0.18 * u);
          if (row < rows) {
            var n = row * columns + column;
            var next = row * columns + (column + 1) % columns;
            indices.push(n, n + columns, next, next, n + columns, next + columns);
          }
        }
      }
      for (var cap = 1; cap < columns - 1; cap++) {
        indices.push(0, cap + 1, cap);
        indices.push(rows * columns, rows * columns + cap, rows * columns + cap + 1);
      }
      var result = new T.BufferGeometry();
      result.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      result.setIndex(indices);
      result.computeVertexNormals();
      return result;
    });
    [-0.58, -0.03, 0.52].forEach(function (z, stageIndex) {
      var stage = c.part(rotor, 'compressor-stage-' + (stageIndex + 1), [0, 0, z], [0, 0, (stageIndex - 1) * 0.48]);
      var bladeInstances = [], fasteners = [];
      for (var index = 0; index < blades; index++) {
        var angle = index / blades * TAU + stageIndex * 0.08;
        bladeInstances.push({ r: [0, 0, angle] });
        fasteners.push({ p: [0.3 * Math.cos(angle), 0.3 * Math.sin(angle), 0.086], r: [Math.PI / 2, 0, 0] });
      }
      c.batch(stage, blade, stageIndex === 1 ? p.metal : p.silver, bladeInstances);
      c.mesh(stage, c.cylinder(0.42, 0.14), p.dark, [0, 0, 0], [Math.PI / 2, 0, 0]);
      c.ring(stage, 0.39, 0.03, p.gold, [0, 0, 0.084]);
      c.batch(stage, c.cylinder(0.025, 0.026, 0.025, 6), p.silver, fasteners);
    });
    [-1.05, 1.01].forEach(function (z, index) {
      var bearing = c.part(c.body, 'ball-bearing-' + index, [0, 0, z], [0, 0, index ? 0.82 : -0.7]);
      c.ring(bearing, 0.5, 0.095, p.silver);
      c.ring(bearing, 0.26, 0.052, p.silver);
      c.ring(bearing, 0.38, 0.074, p.dark, [0, 0, -0.07]);
      var balls = [];
      for (var i = 0; i < 14; i++) balls.push({ p: [0.38 * Math.cos(i / 14 * TAU), 0.38 * Math.sin(i / 14 * TAU), 0] });
      c.batch(bearing, c.sphere(0.068), p.silver, balls);
    });
    var spinnerShape = c.geometry('spinner', function () { return new T.LatheGeometry([[0, 0.44], [0.09, 0.39], [0.21, 0.22], [0.25, 0], [0, 0]].map(function (v) { return new T.Vector2(v[0], v[1]); }), 40); });
    c.mesh(rotor, spinnerShape, p.silver, [0, 0, 1.15], [Math.PI / 2, 0, 0]);
    c.box(c.body, 2.16, 0.18, 2.6, p.dark, [0, -1.77, -0.05], 0.045);
    var supports = [], bolts = [];
    [-0.91, 0.91].forEach(function (x) {
      [-0.74, 0.72].forEach(function (z) {
        supports.push(c.rodItem([x, -1.65, z], [x * 0.72, -1.18, z], 0.12));
        bolts.push({ p: [x, -1.66, z], s: [1, 0.7, 1] });
      });
    });
    c.rods(c.body, p.metal, supports);
    c.batch(c.body, c.cylinder(0.09, 0.065, 0.09, 6), p.silver, bolts);
    c.animate(function (t) { rotor.rotation.z = t * speed % TAU; });
    c.motion(rotor, 'z');
    c.port(c.body, 'mount', [0, -1.86, -0.05], [0, -1, 0], 'support');
    c.port(c.body, 'shaft-back', [0, 0, -1.325], [0, 0, -1], 'axial-mechanical');
  }

  function serverRack(c) {
    var p = c.palette;
    var units = Math.round(number(c.params, 'units', 8, 4, 12));
    var speed = number(c.params, 'speed', 1, -5, 5);
    c.box(c.body, 2.02, 0.16, 1.52, p.dark, [0, -1.94, 0]);
    c.box(c.body, 2.02, 0.15, 1.52, p.metal, [0, 1.94, 0]);
    var posts = [], holes = [];
    [-0.93, 0.93].forEach(function (x) {
      [-0.62, 0.62].forEach(function (z) { posts.push({ p: [x, 0, z] }); });
      for (var y = 0; y < 36; y++) holes.push({ p: [x, -1.78 + y * 0.101, 0.691], s: [0.033, 0.04, 0.013] });
    });
    c.batch(c.body, c.roundedBox(0.12, 3.77, 0.13, 0.018), p.silver, posts);
    c.batch(c.body, c.unitBox(), p.black, holes);
    c.box(c.body, 1.74, 3.66, 0.06, p.dark, [0, 0, -0.7]);
    var cables = [];
    for (var cable = 0; cable < 5; cable++) {
      cables.push([[-0.8 + cable * 0.08, -1.78, -0.78], [-0.84 + cable * 0.08, -0.5, -0.84], [-0.75 + cable * 0.08, 1.1, -0.81], [-0.45 + cable * 0.16, 1.8, -0.77]]);
    }
    cables.forEach(function (points, index) { c.tube(c.body, points, 0.022, index % 2 ? p.gold : p.metal); });
    var pitch = 3.3 / units;
    for (var unit = 0; unit < units; unit++) {
      var tray = c.part(c.body, 'hot-swap-server-' + (unit + 1), [0, -1.48 + unit * pitch, 0], [0, 0, 0.35 + (unit % 3) * 0.26]);
      c.box(tray, 1.71, pitch * 0.77, 1.25, p.dark, [0, 0, 0]);
      c.box(tray, 1.7, pitch * 0.73, 0.05, unit % 2 ? p.metal : p.silver, [0, 0, 0.665], 0.009);
      var bays = [], vents = [], indicators = [], screws = [];
      for (var bay = 0; bay < 4; bay++) {
        var x = -0.59 + bay * 0.38;
        bays.push({ p: [x, 0, 0.706] });
        for (var vent = 0; vent < 5; vent++) vents.push({ p: [x - 0.112 + vent * 0.044, 0.014, 0.73], s: [0.017, pitch * 0.32, 0.014] });
        indicators.push({ p: [x - 0.11, -pitch * 0.24, 0.744], s: [0.045, 0.018, 0.022], color: bay === 3 && unit % 3 === 0 ? '#ffb45f' : c.accent });
      }
      [-0.805, 0.805].forEach(function (x) { screws.push({ p: [x, 0, 0.709], r: [Math.PI / 2, 0, 0] }); });
      c.batch(tray, c.roundedBox(0.335, pitch * 0.56, 0.025, 0.004), p.black, bays);
      c.batch(tray, c.unitBox(), p.metal, vents);
      c.batch(tray, c.unitBox(), c.glow('#ffffff', 1.1), indicators);
      c.batch(tray, c.cylinder(0.027, 0.022, 0.027, 6), p.dark, screws);
    }
    [-0.53, 0.53].forEach(function (x, index) {
      var fan = c.part(c.body, 'exhaust-fan-' + index, [x, 1.966, 0]);
      c.ring(fan, 0.3, 0.027, p.dark, [0, 0, 0], [Math.PI / 2, 0, 0]);
      var spinning = c.part(fan, 'fan-rotor');
      var paddles = [];
      for (var blade = 0; blade < 7; blade++) {
        var a = blade / 7 * TAU;
        paddles.push({ p: [Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17], r: [0.12, -a, 0.32] });
      }
      c.batch(spinning, c.roundedBox(0.2, 0.025, 0.088, 0.005), p.black, paddles);
      c.mesh(spinning, c.cylinder(0.066, 0.043), p.silver);
      c.animate(function (t) { spinning.rotation.y = t * speed * (2.3 + index * 0.1) % TAU; });
      c.motion(spinning, 'y');
    });
    var beacon = c.box(c.body, 0.51, 0.035, 0.023, p.light, [0, 1.84, 0.746], 0.005);
    c.animate(function (t) { beacon.material.emissiveIntensity = 1.2 + 0.35 * Math.sin(t * speed * 2.1); });
    c.port(c.body, 'network', [0.6, -1.4, -0.73], [0, 0, -1], 'logical-signal');
    c.port(c.body, 'power', [-0.6, -1.4, -0.73], [0, 0, -1], 'electrical');
    c.port(c.body, 'mount', [0, -2.02, 0], [0, -1, 0], 'support');
  }

  function processor(c) {
    var p = c.palette;
    var boardMaterial = c.standard('#164d48', 0.04, 0.61);
    var signalMaterial = c.glow(c.accent, 1.05);
    var speed = number(c.params, 'speed', 1, -5, 5);
    c.box(c.body, 3.35, 0.13, 3.35, boardMaterial, [0, -0.3, 0]);
    var pins = [], vias = [], traces = [], paths = [];
    for (var side = 0; side < 4; side++) {
      var angle = side * Math.PI / 2;
      var co = Math.cos(angle), si = Math.sin(angle);
      function turn(x, z, y) { return [x * co - z * si, y, x * si + z * co]; }
      for (var pin = 0; pin < 18; pin++) {
        var offset = -1.3 + pin * 2.6 / 17;
        pins.push({ p: turn(offset, 1.7, -0.3), r: [0, -angle, 0], s: [0.048, 0.048, 0.24] });
        pins.push({ p: turn(offset, 1.81, -0.39), r: [0, -angle, 0], s: [0.048, 0.2, 0.048] });
        pins.push({ p: turn(offset, 1.89, -0.48), r: [0, -angle, 0], s: [0.048, 0.045, 0.2] });
      }
      for (var lane = 0; lane < 9; lane++) {
        var x = -0.74 + lane * 0.185;
        var bend = 1.18 + (lane % 3) * 0.09;
        var route = [turn(x, 0.93, -0.218), turn(x, bend, -0.218), turn(x * 1.48, bend, -0.218), turn(x * 1.48, 1.57, -0.218)];
        paths.push(route);
        for (var segment = 0; segment < route.length - 1; segment++) traces.push(c.rodItem(route[segment], route[segment + 1], 0.013));
        vias.push({ p: route[route.length - 1] });
      }
    }
    c.batch(c.body, c.unitBox(), p.gold, pins);
    c.rods(c.body, p.gold, traces);
    c.batch(c.body, c.cylinder(0.035, 0.025, 0.035, 12), p.silver, vias);
    var substrate = c.part(c.body, 'ceramic-package', [0, -0.13, 0], [0, 0.34, 0]);
    c.box(substrate, 2.02, 0.14, 2.02, p.ceramic);
    c.box(substrate, 1.82, 0.08, 1.82, p.dark, [0, 0.115, 0]);
    var interposer = c.part(c.body, 'copper-interposer', [0, 0.075, 0], [0, 0.7, 0]);
    c.box(interposer, 1.58, 0.075, 1.58, p.gold);
    var silicon = c.part(c.body, 'silicon-die-and-gate-array', [0, 0.185, 0], [0, 1.13, 0]);
    c.box(silicon, 1.43, 0.12, 1.43, p.black);
    var tiles = [], streets = [], contacts = [];
    for (var ix = 0; ix < 6; ix++) {
      for (var iz = 0; iz < 6; iz++) {
        tiles.push({ p: [-0.56 + ix * 0.224, 0.082, -0.56 + iz * 0.224], color: (ix + iz) % 3 === 0 ? c.color : '#335b70' });
        contacts.push({ p: [-0.59 + ix * 0.235, 0.113, -0.59 + iz * 0.235], s: [0.035, 0.008, 0.014] });
      }
      streets.push({ p: [-0.665 + ix * 0.223, 0.071, 0], s: [0.009, 0.009, 1.3] });
      streets.push({ p: [0, 0.071, -0.665 + ix * 0.223], s: [1.3, 0.009, 0.009] });
    }
    c.batch(silicon, c.roundedBox(0.199, 0.034, 0.199, 0.006), c.standard('#ffffff', 0.6, 0.24), tiles);
    c.batch(silicon, c.unitBox(), signalMaterial, streets);
    c.batch(silicon, c.unitBox(), p.gold, contacts);
    var cap = c.part(c.body, 'protective-window', [0, 0.34, 0], [0, 1.58, 0]);
    [[0, 0, -0.77], [0, 0, 0.77]].forEach(function (position) { c.box(cap, 1.69, 0.09, 0.12, p.silver, position, 0.016); });
    [[-0.77, 0, 0], [0.77, 0, 0]].forEach(function (position) { c.box(cap, 0.12, 0.09, 1.43, p.silver, position, 0.016); });
    if (c.params.lid === true) c.box(cap, 1.42, 0.025, 1.42, c.standard('#93bfd1', 0.1, 0.12, { transparent: true, opacity: 0.13, depthWrite: false }), [0, 0.022, 0]);
    var packetItems = paths.map(function (route) { return { p: route[0] }; });
    var packets = c.batch(c.body, c.sphere(0.023), p.light, packetItems, true);
    c.movingPoints(packets, paths.flat().map(function (v) { return [v[0], v[1] + 0.026, v[2]]; }), 0.023);
    c.port(c.body, 'mount', [0, -0.365, 0], [0, -1, 0], 'component-mount');
    c.port(c.body, 'bus', [-1.3, -0.48, 2.01], [0, 0, 1], 'logical-signal');
    c.port(silicon, 'die-surface', [0, 0.06, 0], [0, 1, 0], 'logical-marker-slot');
    c.animate(function (t) {
      signalMaterial.emissiveIntensity = 0.9 + 0.28 * Math.sin(t * speed * 2);
      paths.forEach(function (route, index) {
        var progress = ((t * speed * 0.34 + index / paths.length) % 1 + 1) % 1 * 3;
        var segment = Math.min(2, Math.floor(progress));
        var fraction = progress - segment;
        var a = route[segment], b = route[segment + 1];
        packets.setMatrixAt(index, c.matrix({ p: [a[0] + (b[0] - a[0]) * fraction, a[1] + 0.026, a[2] + (b[2] - a[2]) * fraction] }));
      });
      packets.instanceMatrix.needsUpdate = true;
    });
  }

  function memoryBank(c) {
    var T = c.T, p = c.palette;
    var count = Math.round(number(c.params, 'modules', 4, 2, 6));
    var speed = number(c.params, 'speed', 1, -5, 5);
    var pcb = c.standard('#1b6357', 0.04, 0.65);
    c.box(c.body, 3.37, 0.12, 2.73, p.dark, [0, -0.69, 0]);
    var dimmShape = c.geometry('notched-dimm-pcb', function () {
      var shape = new T.Shape();
      shape.moveTo(-1.48, -0.47);
      shape.lineTo(-0.4, -0.47);
      shape.lineTo(-0.4, -0.34);
      shape.lineTo(-0.27, -0.34);
      shape.lineTo(-0.27, -0.47);
      shape.lineTo(1.48, -0.47);
      shape.lineTo(1.48, 0.47);
      shape.lineTo(-1.48, 0.47);
      shape.closePath();
      var result = new T.ExtrudeGeometry(shape, { depth: 0.065, bevelEnabled: true, bevelSize: 0.009, bevelThickness: 0.009, bevelSegments: 1, steps: 1 });
      result.translate(0, 0, -0.0325);
      return result;
    });
    for (var moduleIndex = 0; moduleIndex < count; moduleIndex++) {
      var z = -0.99 + moduleIndex * 1.98 / (count - 1);
      c.box(c.body, 3.15, 0.17, 0.18, p.black, [0, -0.54, z]);
      var board = c.part(c.body, 'dimm-' + (moduleIndex + 1), [0, 0, z], [0, 0.5 + moduleIndex * 0.14, (moduleIndex - (count - 1) / 2) * 0.22]);
      c.mesh(board, dimmShape, pcb);
      var chips = [], contacts = [], pins = [], markings = [], traces = [];
      for (var face = -1; face <= 1; face += 2) {
        for (var chip = 0; chip < 8; chip++) {
          var x = -1.28 + chip * 0.365;
          chips.push({ p: [x, 0.095, face * 0.081] });
          markings.push({ p: [x - 0.045, 0.145, face * 0.12], s: [0.12, 0.014, 0.006] });
          for (var leg = 0; leg < 4; leg++) {
            pins.push({ p: [x - 0.102 + leg * 0.068, -0.09, face * 0.061], s: [0.023, 0.084, 0.026] });
            pins.push({ p: [x - 0.102 + leg * 0.068, 0.286, face * 0.061], s: [0.023, 0.078, 0.026] });
          }
          traces.push({ p: [x, -0.235, face * 0.043], s: [0.015, 0.15, 0.008] });
        }
        for (var contact = 0; contact < 42; contact++) {
          var position = -1.39 + contact * 2.78 / 41;
          if (position > -0.44 && position < -0.24) continue;
          contacts.push({ p: [position, -0.373, face * 0.045], s: [0.04, 0.15, 0.012] });
        }
      }
      c.batch(board, c.roundedBox(0.29, 0.3, 0.072, 0.009), p.black, chips);
      c.batch(board, c.unitBox(), p.gold, contacts.concat(traces));
      c.batch(board, c.unitBox(), p.silver, pins);
      c.batch(board, c.unitBox(), p.metal, markings);
      c.box(board, 2.95, 0.038, 0.1, p.light, [0, 0.43, 0], 0.008);
      [-1.58, 1.58].forEach(function (x) { c.box(c.body, 0.12, 0.3, 0.23, p.ceramic, [x, -0.43, z], 0.019); });
    }
    var capacitors = [];
    for (var i = 0; i < 10; i++) capacitors.push({ p: [-1.31 + i * 0.29, -0.55, 1.25] });
    c.batch(c.body, c.cylinder(0.057, 0.11, 0.057, 12), p.silver, capacitors);
    c.animate(function (t) { p.light.emissiveIntensity = 1.1 + 0.4 * Math.sin(t * speed * 2.8); });
    c.port(c.body, 'mount', [0, -0.75, 0], [0, -1, 0], 'component-mount');
    c.port(c.body, 'bus', [0, -0.69, 1.365], [0, 0, 1], 'logical-signal');
  }

  function dna(c) {
    var pairs = Math.round(number(c.params, 'basePairs', 28, 12, 40));
    var turns = number(c.params, 'turns', 2.45, 1, 4);
    var speed = number(c.params, 'speed', 1, -5, 5);
    var molecule = c.part(c.body, 'double-helix');
    var local = c.params.separation === 'local';
    var strands = [c.part(molecule, 'sugar-phosphate-strand-a', [0, 0, 0], local ? null : [-0.68, 0, 0]), c.part(molecule, 'sugar-phosphate-strand-b', [0, 0, 0], local ? null : [0.68, 0, 0])];
    var center = c.params.separationCenter, span = c.params.separationSpan;
    var regionStart = Math.max(0, center - span / 2), regionEnd = Math.min(1, center + span / 2);
    function offset(point) {
      var fraction = point[1] / 3.9 + 0.5;
      if (fraction <= regionStart || fraction >= regionEnd) return [0, 0, 0];
      var angle = fraction * TAU * turns;
      var radial = point[0] * Math.cos(angle) - point[2] * Math.sin(angle) >= 0 ? 1 : -1;
      var amount = 0.9 * Math.pow(Math.sin(Math.PI * (fraction - regionStart) / (regionEnd - regionStart)), 2) * radial;
      return [amount * Math.cos(angle), 0, -amount * Math.sin(angle)];
    }
    function deformBackbone(object) {
      var shape = object.geometry, attr = shape.attributes.position, normal = shape.attributes.normal;
      var closed = attr.array.slice(), closedNormals = normal.array.slice(), points = [], rings = [];
      var segments = shape.parameters.tubularSegments, ringSize = shape.parameters.radialSegments + 1;
      var curve = shape.parameters.path, radius = shape.parameters.radius;
      for (var ring = 0; ring <= segments; ring++) {
        var t = ring / segments, centerPoint = curve.getPointAt(t), shift = new c.T.Vector3().fromArray(offset(centerPoint.toArray()));
        var before = curve.getPointAt(Math.max(0, t - 0.0001)), after = curve.getPointAt(Math.min(1, t + 0.0001));
        var derivative = after.clone().sub(before);
        var shiftDerivative = new c.T.Vector3().fromArray(offset(after.toArray())).sub(new c.T.Vector3().fromArray(offset(before.toArray())));
        rings.push({ center: centerPoint, shift: shift, derivative: derivative, shiftDerivative: shiftDerivative, tangent: derivative.clone().normalize() });
        // Every intermediate center lies on the closed/open segment; rotated
        // circular cross-sections remain inside its radius-expanded envelope.
        [0, 1].forEach(function (amount) {
          var point = centerPoint.clone().addScaledVector(shift, amount);
          points.push(point.clone().addScalar(radius + 0.00001).toArray(), point.clone().addScalar(-radius - 0.00001).toArray());
        });
      }
      var envelope = new c.T.Box3().setFromPoints(points.map(function (p) { return new c.T.Vector3().fromArray(p); }));
      shape.boundingBox = envelope;
      shape.boundingSphere = envelope.getBoundingSphere(new c.T.Sphere());
      attr.setUsage(c.T.DynamicDrawUsage); normal.setUsage(c.T.DynamicDrawUsage);
      var previous = -1, q = new c.T.Quaternion(), tangent = new c.T.Vector3(), vertex = new c.T.Vector3();
      c.explodeDeformation(object, points, function (amount) {
        if (amount === previous) return;
        previous = amount;
        if (amount === 0) { attr.array.set(closed); normal.array.set(closedNormals); }
        else rings.forEach(function (r, ring) {
          tangent.copy(r.derivative).addScaledVector(r.shiftDerivative, amount).normalize();
          q.setFromUnitVectors(r.tangent, tangent);
          for (var j = 0; j < ringSize; j++) {
            var i = (ring * ringSize + j) * 3;
            vertex.fromArray(closed, i).sub(r.center).applyQuaternion(q).add(r.center).addScaledVector(r.shift, amount).toArray(attr.array, i);
            vertex.fromArray(closedNormals, i).applyQuaternion(q).normalize().toArray(normal.array, i);
          }
        });
        attr.needsUpdate = true; normal.needsUpdate = true;
      });
    }
    function deformInstances(object, items) {
      var shifts = items.map(function (item) { return offset(item.p); });
      var points = [], matrix = new c.T.Matrix4();
      object.geometry.computeBoundingBox();
      items.forEach(function (item, index) {
        var bounds = object.geometry.boundingBox.clone().applyMatrix4(c.matrix(item));
        [0, 1].forEach(function (amount) {
          for (var corner = 0; corner < 8; corner++) points.push([
            (corner & 1 ? bounds.max.x : bounds.min.x) + shifts[index][0] * amount,
            corner & 2 ? bounds.max.y : bounds.min.y,
            (corner & 4 ? bounds.max.z : bounds.min.z) + shifts[index][2] * amount
          ]);
        });
      });
      object.instanceMatrix.setUsage(c.T.DynamicDrawUsage);
      var previous = -1;
      c.explodeDeformation(object, points, function (amount) {
        if (amount === previous) return;
        previous = amount;
        items.forEach(function (item, index) {
          matrix.copy(c.matrix(item));
          matrix.elements[12] += shifts[index][0] * amount;
          matrix.elements[14] += shifts[index][2] * amount;
          object.setMatrixAt(index, matrix);
        });
        object.instanceMatrix.needsUpdate = true;
      });
    }
    var backboneMaterial = [c.standard(c.color, 0.32, 0.28), c.standard(c.accent, 0.32, 0.28)];
    var atomMaterial = c.standard('#ffffff', 0.18, 0.27);
    var baseColors = ['#eea451', '#82d8d4', '#bf87e8', '#e7748a'];
    var beadLists = [[], []], bondLists = [[], []];
    for (var strand = 0; strand < 2; strand++) {
      var path = [];
      for (var sample = 0; sample <= 120; sample++) {
        var u = sample / 120;
        var angle = u * TAU * turns + strand * Math.PI;
        // Y-up right-handed coordinates: X cross -Z is +Y. Mirroring only
        // one backbone or the camera would leave the rungs inconsistent.
        path.push([0.77 * Math.cos(angle), (u - 0.5) * 3.9, -0.77 * Math.sin(angle)]);
      }
      var backbone = c.tube(strands[strand], path, 0.05, backboneMaterial[strand]);
      if (local) deformBackbone(backbone);
    }
    for (var pair = 0; pair < pairs; pair++) {
      var fraction = pair / (pairs - 1);
      var theta = fraction * TAU * turns;
      var y = (fraction - 0.5) * 3.9;
      for (var side = 0; side < 2; side++) {
        var sign = side === 0 ? 1 : -1;
        var end = [Math.cos(theta) * 0.77 * sign, y, -Math.sin(theta) * 0.77 * sign];
        var inner = [Math.cos(theta) * 0.045 * sign, y, -Math.sin(theta) * 0.045 * sign];
        var tint = baseColors[(pair % 2) * 2 + side];
        beadLists[side].push({ p: end, s: [0.095, 0.095, 0.095], color: side ? c.accent : c.color });
        bondLists[side].push(c.rodItem(end, inner, 0.027, tint));
        for (var atomIndex = 0; atomIndex < 3; atomIndex++) {
          var r = 0.19 + atomIndex * 0.17;
          beadLists[side].push({ p: [Math.cos(theta) * r * sign, y, -Math.sin(theta) * r * sign], s: [0.056, 0.056, 0.056], color: tint });
        }
      }
    }
    for (var s = 0; s < 2; s++) {
      var beads = c.batch(strands[s], c.geometry('molecular-bead', function () { return new c.T.SphereGeometry(1, 12 + c.detail * 2, 8); }), atomMaterial, beadLists[s]);
      var bonds = c.rods(strands[s], atomMaterial, bondLists[s]);
      if (local) { deformInstances(beads, beadLists[s]); deformInstances(bonds, bondLists[s]); }
    }
    c.animate(function (t) { molecule.rotation.y = t * speed * 0.17 % TAU; });
    c.motion(molecule, 'y');
    c.port(strands[0], 'strand-a-start', [0.77, -1.95, 0], [0, -1, 0], 'molecular-backbone');
    c.port(strands[1], 'strand-b-start', [-0.77, -1.95, 0], [0, -1, 0], 'molecular-backbone');
    c.root.userData.representation = 'Stylized base pairs and phosphate backbones; not an atom-resolved molecular structure.';
  }

  function atom(c) {
    var p = c.palette;
    var electrons = Math.round(number(c.params, 'electrons', 5, 2, 8));
    var nucleons = Math.round(number(c.params, 'nucleons', 25, 8, 48));
    var speed = number(c.params, 'speed', 1, -5, 5);
    var nucleus = c.part(c.body, 'nucleus');
    var particles = [{ p: [0, 0, 0], color: '#f0b37a' }];
    for (var i = 1; i < nucleons; i++) {
      var v = (i - 0.5) / (nucleons - 1);
      var z = 1 - 2 * v;
      var radius = 0.44 * Math.sqrt(1 - z * z);
      var a = i * 2.399963229728653;
      particles.push({ p: [Math.cos(a) * radius, z * 0.44, Math.sin(a) * radius], color: i % 2 ? '#e7735b' : '#d7e5ed' });
    }
    c.batch(nucleus, c.sphere(0.145), c.standard('#ffffff', 0.2, 0.3), particles);
    for (var electron = 0; electron < electrons; electron++) {
      (function (index) {
        var orbit = c.part(c.body, 'orbital-guide-' + (index + 1));
        orbit.rotation.set(index / electrons * Math.PI, 0.35 + index * 0.37, index * 0.58);
        var radius = 1.68 + (index % 2) * 0.13;
        var guide = c.ring(orbit, radius, 0.012, p.metal);
        guide.scale.y = 0.74;
        var point = c.mesh(orbit, c.sphere(0.078), p.light);
        var trailItems = [];
        for (var j = 0; j < 12; j++) trailItems.push({});
        var trails = c.batch(orbit, c.sphere(0.031), p.light, trailItems, true);
        c.motion(guide, null, 1.22);
        c.movingPoints(point, [[-radius * 1.22, -radius * 0.74 * 1.22, 0], [radius * 1.22, radius * 0.74 * 1.22, 0]], 0.078);
        c.movingPoints(trails, [[-radius * 1.22, -radius * 0.74 * 1.22, 0], [radius * 1.22, radius * 0.74 * 1.22, 0]], 0.031);
        c.animate(function (t, e) {
          var angle = t * speed * (0.75 + index * 0.13) + index * TAU / electrons;
          var expanded = 1 + e * 0.22;
          guide.scale.set(expanded, 0.74 * expanded, 1);
          point.position.set(Math.cos(angle) * radius * expanded, Math.sin(angle) * radius * 0.74 * expanded, 0);
          for (var tail = 0; tail < trailItems.length; tail++) {
            var a = angle - (tail + 1) * 0.045;
            var taper = 0.9 - tail * 0.055;
            trails.setMatrixAt(tail, c.matrix({ p: [Math.cos(a) * radius * expanded, Math.sin(a) * radius * 0.74 * expanded, 0], s: [taper, taper, taper] }));
          }
          trails.instanceMatrix.needsUpdate = true;
        });
      })(electron);
    }
    c.animate(function (t, e) { nucleus.rotation.y = t * speed * 0.1 % TAU; nucleus.scale.setScalar(1 + e * 0.38); });
    c.motion(nucleus, 'y', 1.38);
    c.port(nucleus, 'nucleus-center', [0, 0, 0], [0, 1, 0], 'conceptual-anchor');
    c.root.userData.representation = 'Conceptual orbital guides, not electron trajectories or a quantum probability solution.';
  }

  function planet(c) {
    var T = c.T;
    var width = c.detail === 1 ? 256 : c.detail === 2 ? 512 : 1024, height = width / 2;
    var albedo = new Uint8Array(width * height * 4);
    var heights = new Uint8Array(width * height * 4);
    var roughness = new Uint8Array(width * height * 4);
    var clouds = new Uint8Array(width * height * 4);
    var tint = new T.Color(c.color).convertLinearToSRGB();
    var seed = number(c.params, 'seed', 3, -100, 100);
    var waterLevel = number(c.params, 'waterLevel', 0.035, -0.35, 0.35);
    function field(x, y, z, phase) {
      return Math.sin(x * 3.1 + Math.sin(z * 2.7 + phase)) * Math.cos(y * 4.3 - z * 1.6) * 0.54 + Math.sin(x * 6.7 + y * 3.4 + phase) * Math.cos(z * 5.8 - y * 2.2) * 0.27 + Math.sin(x * 13.7 - y * 8.1 + z * 6.9 + phase) * 0.12 + Math.cos(x * 27.8 + y * 22.4 - z * 14.6) * 0.055;
    }
    for (var row = 0; row < (c.metadataOnly ? 0 : height); row++) {
      var latitude = row / (height - 1) * Math.PI;
      for (var column = 0; column < width; column++) {
        var longitude = column / (width - 1) * TAU;
        var x = Math.sin(latitude) * Math.cos(longitude), y = Math.cos(latitude), z = Math.sin(latitude) * Math.sin(longitude);
        var detailNoise = Math.sin(x * 97 + z * 51 + seed) * Math.cos(y * 83 - z * 41) * 0.018 + Math.sin(x * 193 - y * 127 + z * 89) * 0.008;
        var elevation = field(x, y, z, seed * 0.37) + detailNoise;
        var land = clamp((elevation - waterLevel) * 45, 0, 1);
        var mountain = clamp((elevation - 0.3) * 3.5 + Math.abs(Math.sin(x * 53 + z * 39) * Math.sin(y * 61 - x * 23)) * 0.14, 0, 1);
        var ice = clamp((Math.abs(y) - 0.83 + elevation * 0.1) * 10, 0, 1);
        var arid = clamp(1 - Math.abs(y - 0.24) * 2.4 + field(z, x, y, 1) * 0.3, 0, 1);
        var depth = clamp((elevation + 0.5) * 0.85, 0, 0.7);
        var landColor = [0.14 + tint.r * 0.25 + arid * 0.29, 0.22 + tint.g * 0.25 + arid * 0.12, 0.16 + tint.b * 0.2];
        var shore = clamp(1 - Math.abs(elevation - waterLevel) * 25, 0, 1);
        var ocean = [0.018 + depth * 0.022, 0.045 + depth * 0.13 + shore * 0.1, 0.12 + depth * 0.19 + shore * 0.08];
        var offset = (row * width + column) * 4;
        for (var channel = 0; channel < 3; channel++) {
          var base = ocean[channel] * (1 - land) + (landColor[channel] * (1 - mountain) + 0.56 * mountain) * land;
          albedo[offset + channel] = Math.round(clamp(base * (1 - ice) + 0.89 * ice, 0, 1) * 255);
          heights[offset + channel] = Math.round(clamp(0.22 + Math.max(0, elevation - waterLevel) * 0.8 + ice * 0.1, 0, 1) * 255);
          roughness[offset + channel] = Math.round(115 + land * 112 + ice * 20);
          clouds[offset + channel] = 242;
        }
        albedo[offset + 3] = heights[offset + 3] = roughness[offset + 3] = 255;
        var warp = Math.sin(y * 19 + z * 7 + seed) * 0.065;
        var cloudField = field(x * 2.3 + warp, y * 2.8, z * 2.3 - warp, seed * 0.23 + 2);
        var filaments = Math.sin(x * 91 + y * 47 + Math.sin(z * 23) * 5) * Math.cos(z * 59 - y * 31) * 0.085;
        clouds[offset + 3] = Math.round(clamp((cloudField - 0.23 + filaments) * 1.65, 0, 0.68) * 255);
      }
    }
    var crust = c.part(c.body, 'procedural-planet');
    var geometry = c.geometry('planet-sphere', function () { return new T.SphereGeometry(1.55, 48 + c.detail * 16, 24 + c.detail * 8); });
    var surface = c.standard('#ffffff', 0, 0.95, { envMapIntensity: 0.08, map: c.texture(albedo, width, height, true), bumpMap: c.texture(heights, width, height), bumpScale: 0.035, roughnessMap: c.texture(roughness, width, height) });
    c.mesh(crust, geometry, surface);
    var weather = c.mesh(c.body, geometry, c.standard('#ffffff', 0, 0.96, { map: c.texture(clouds, width, height, true), transparent: true, opacity: 0.73, depthWrite: false }), null, null, [1.012, 1.012, 1.012]);
    c.motion(crust, 'y');
    c.motion(weather, 'y', (1.012 + 0.13) / 1.012);
    weather.name = 'procedural-cloud-layer';
    var atmosphere = c.mesh(c.body, geometry, c.shader({
      uniforms: { uColor: { value: new T.Color(c.accent) } },
      vertexShader: 'varying vec3 vNormal; varying vec3 vView; void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform vec3 uColor; varying vec3 vNormal; varying vec3 vView; void main(){float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),3.2);gl_FragColor=vec4(uColor,rim*0.5);}',
      side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending
    }), null, null, [1.048, 1.048, 1.048]);
    atmosphere.name = 'limb-scattering';
    c.motion(atmosphere, null, (1.048 + 0.22) / 1.048);
    if (c.params.rings !== false) {
      var rings = c.part(c.body, 'stratified-ice-rings', [0, 0, 0], [0, 0.45, 0]);
      var ringData = new Uint8Array(256 * 4);
      for (var i = 0; i < 256; i++) {
        var r = i / 255;
        var band = clamp(0.58 + Math.sin(r * 41) * 0.12 + Math.sin(r * 89 + 1) * 0.05, 0.2, 0.85);
        var gap = r > 0.55 && r < 0.6 || r > 0.83 && r < 0.855;
        ringData[i * 4] = Math.round(200 * band);
        ringData[i * 4 + 1] = Math.round(180 * band);
        ringData[i * 4 + 2] = Math.round(149 * band);
        ringData[i * 4 + 3] = gap ? 4 : Math.round(210 * band * Math.min(1, r * 16, (1 - r) * 16));
      }
      var ringShape = c.geometry('planet-annulus', function () {
        var shape = new T.RingGeometry(1.91, 2.69, 160, 1);
        var positions = shape.attributes.position, uv = shape.attributes.uv;
        for (var vertex = 0; vertex < positions.count; vertex++) uv.setXY(vertex, (Math.hypot(positions.getX(vertex), positions.getY(vertex)) - 1.91) / 0.78, 0.5);
        return shape;
      });
      c.mesh(rings, ringShape, c.standard('#ffffff', 0.16, 0.78, { map: c.texture(ringData, 256, 1, true), side: T.DoubleSide, transparent: true, depthWrite: false, alphaTest: 0.025 }), null, [Math.PI / 2 + 0.24, 0.1, 0.18]);
    }
    var speed = number(c.params, 'speed', 1, -5, 5);
    c.animate(function (t, e) {
      crust.rotation.y = t * speed * 0.095 % TAU;
      weather.rotation.y = t * speed * 0.108 % TAU;
      weather.scale.setScalar(1.012 + e * 0.13);
      atmosphere.scale.setScalar(1.048 + e * 0.22);
    });
    c.root.userData.representation = 'Fictional planet; seamless trigonometric terrain and cloud maps, no geographic imagery.';
  }

  function satellite(c) {
    var T = c.T, p = c.palette;
    var speed = number(c.params, 'speed', 1, -5, 5);
    var foilShape = c.geometry('crinkled-multilayer-insulation', function () {
      var geometry = new T.BoxGeometry(1.04, 1.22, 0.87, 8, 10, 8);
      var positions = geometry.attributes.position, normals = geometry.attributes.normal;
      for (var i = 0; i < positions.count; i++) {
        var x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        var wrinkle = Math.sin(x * 32 + y * 27 + z * 19) * Math.cos(y * 44 - z * 31) * 0.017;
        positions.setXYZ(i, x + normals.getX(i) * wrinkle, y + normals.getY(i) * wrinkle, z + normals.getZ(i) * wrinkle);
      }
      geometry.computeVertexNormals();
      return geometry;
    });
    var bus = c.part(c.body, 'insulated-avionics-bus');
    c.mesh(bus, foilShape, c.standard('#d5a34e', 0.79, 0.37, { flatShading: true }));
    var frame = [], ports = [];
    [-0.56, 0.56].forEach(function (x) {
      [-0.46, 0.46].forEach(function (z) { frame.push({ p: [x, 0, z], s: [0.057, 1.3, 0.057] }); });
    });
    [-0.64, 0.64].forEach(function (y) {
      [-0.46, 0.46].forEach(function (z) { frame.push({ p: [0, y, z], s: [1.16, 0.057, 0.057] }); });
      [-0.56, 0.56].forEach(function (x) { frame.push({ p: [x, y, 0], s: [0.057, 0.057, 0.95] }); });
    });
    c.batch(bus, c.roundedBox(1, 1, 1), p.silver, frame);
    for (var port = 0; port < 3; port++) ports.push({ p: [-0.3 + port * 0.3, -0.31, 0.469], r: [Math.PI / 2, 0, 0] });
    c.batch(bus, c.cylinder(0.074, 0.08), p.dark, ports);
    var cellsMaterial = c.standard('#183d7c', 0.58, 0.25, { emissive: '#10295c', emissiveIntensity: 0.18 });
    [-1, 1].forEach(function (side) {
      var hinge = c.part(c.body, side < 0 ? 'port-solar-array' : 'starboard-solar-array', [side * 0.62, 0, 0], [side * 0.45, 0, 0]);
      c.mesh(hinge, c.cylinder(0.065, 0.34), p.silver, [side * 0.1, 0, 0], [0, 0, Math.PI / 2]);
      c.box(hinge, 1.7, 1.14, 0.07, p.silver, [side * 1.04, 0, 0]);
      var cells = [], grid = [];
      for (var column = 0; column < 6; column++) {
        for (var row = 0; row < 4; row++) {
          var x = side * (0.37 + column * 0.267), y = -0.408 + row * 0.272;
          cells.push({ p: [x, y, 0.052], color: (column + row) % 3 ? '#eff6ff' : '#b4d4ff' });
          for (var wire = 0; wire < 3; wire++) grid.push({ p: [x - 0.08 + wire * 0.08, y, 0.068], s: [0.003, 0.233, 0.003] });
        }
      }
      c.batch(hinge, c.roundedBox(0.25, 0.244, 0.022, 0.004), cellsMaterial, cells);
      c.batch(hinge, c.unitBox(), p.gold, grid);
      c.box(hinge, 0.025, 1.11, 0.075, p.dark, [side * 1.04, 0, 0]);
      c.animate(function (t) { hinge.rotation.y = side * (0.11 + Math.sin(t * speed * 0.22) * 0.06); });
      c.motion(hinge, 'y');
    });
    var dish = c.part(c.body, 'high-gain-parabolic-antenna', [0, 0.79, 0.1], [0, 0.62, 0.12]);
    dish.rotation.x = 0.46;
    var profile = [];
    for (var j = 0; j <= 20; j++) { var radius = j / 20 * 0.63; profile.push(new T.Vector2(radius, radius * radius * 0.65)); }
    var dishGeometry = c.geometry('parabolic-reflector', function () { return new T.LatheGeometry(profile, 48 + c.detail * 8); });
    c.mesh(dish, dishGeometry, c.standard('#ccd8dd', 0.75, 0.3, { side: T.DoubleSide }));
    c.ring(dish, 0.63, 0.018, p.gold, [0, 0.258, 0], [Math.PI / 2, 0, 0]);
    var struts = [];
    for (var s = 0; s < 3; s++) {
      var a = s / 3 * TAU;
      struts.push(c.rodItem([0.57 * Math.cos(a), 0.21, 0.57 * Math.sin(a)], [0, 0.62, 0], 0.013));
    }
    c.rods(dish, p.dark, struts);
    c.mesh(dish, c.cylinder(0.067, 0.12), p.gold, [0, 0.61, 0]);
    c.mesh(c.body, c.cylinder(0.025, 0.91), p.silver, [0.37, -1.04, -0.2]);
    c.mesh(c.body, c.sphere(0.062), p.light, [0.37, -1.52, -0.2]);
    var nozzle = c.geometry('thruster-bell', function () { return new T.LatheGeometry([[0.08, 0.16], [0.085, 0.08], [0.13, -0.08], [0.22, -0.24], [0.24, -0.24], [0.14, -0.05], [0.105, 0.16]].map(function (v) { return new T.Vector2(v[0], v[1]); }), 32); });
    c.mesh(c.body, nozzle, p.dark, [-0.18, -0.77, 0.07]);
    c.port(bus, 'payload', [0, -0.31, 0.509], [0, 0, 1], 'logical-signal');
    c.port(dish, 'antenna-feed', [0, 0.67, 0], [0, 1, 0], 'conceptual-direction');
  }

  function opticalBench(c) {
    var T = c.T, p = c.palette;
    var wavelength = number(c.params, 'wavelength', 0.55, 0.2, 2);
    var separation = number(c.params, 'slitSeparation', 0.21, 0.12, 0.45);
    var speed = number(c.params, 'speed', 1, -5, 5);
    var beamMaterial = c.glow(c.accent, 1.8, 0.4);
    var beamGlow = c.glow(c.accent, 0.8, 0.055);
    c.box(c.body, 4.25, 0.16, 1.85, p.dark, [0, -0.79, 0]);
    var holes = [], ticks = [];
    for (var x = 0; x < 18; x++) {
      for (var z = 0; z < 6; z++) holes.push({ p: [-1.94 + x * 0.228, -0.702, -0.72 + z * 0.288] });
      ticks.push({ p: [-1.92 + x * 0.226, -0.698, 0.862], s: [0.009, 0.006, x % 3 === 0 ? 0.1 : 0.05] });
    }
    c.batch(c.body, c.cylinder(0.027, 0.009, 0.027, 10), p.black, holes);
    c.batch(c.body, c.unitBox(), p.silver, ticks);
    c.rods(c.body, p.silver, [-0.5, 0.5].map(function (z) { return c.rodItem([-1.96, -0.61, z], [1.98, -0.61, z], 0.045); }));
    var laser = c.part(c.body, 'collimated-laser-source', [-1.49, 0.01, 0], [-0.45, 0, 0]);
    c.box(laser, 0.73, 0.17, 0.74, p.metal, [0, -0.52, 0]);
    c.mesh(laser, c.cylinder(0.075, 0.47), p.silver, [0, -0.235, 0]);
    c.mesh(laser, c.cylinder(0.24, 0.77), p.dark, [0, 0.18, 0], [0, 0, Math.PI / 2]);
    [-0.3, 0.28].forEach(function (x) { c.ring(laser, 0.235, 0.025, p.silver, [x, 0.18, 0], [0, Math.PI / 2, 0]); });
    c.mesh(laser, c.cylinder(0.155, 0.027), p.light, [0.4, 0.18, 0], [0, 0, Math.PI / 2]);
    var slit = c.part(c.body, 'double-slit-aperture', [-0.07, 0.19, 0], [0, 0.5, 0]);
    var slitGeometry = c.geometry('machined-double-slit', function () {
      var shape = new T.Shape();
      shape.moveTo(-0.53, -0.71); shape.lineTo(0.53, -0.71); shape.lineTo(0.53, 0.71); shape.lineTo(-0.53, 0.71); shape.closePath();
      [-1, 1].forEach(function (sign) {
        var center = sign * separation / 2;
        var hole = new T.Path();
        hole.moveTo(center - 0.022, -0.38); hole.lineTo(center - 0.022, 0.38); hole.lineTo(center + 0.022, 0.38); hole.lineTo(center + 0.022, -0.38); hole.closePath();
        shape.holes.push(hole);
      });
      var geometry = new T.ExtrudeGeometry(shape, { depth: 0.065, bevelEnabled: false, steps: 1 });
      geometry.translate(0, 0, -0.0325);
      return geometry;
    });
    c.mesh(slit, slitGeometry, p.metal, null, [0, Math.PI / 2, 0]);
    c.box(slit, 0.45, 0.15, 1.12, p.dark, [0, -0.81, 0]);
    var apertureLights = [-1, 1].map(function (sign) { return { p: [0.034, 0, sign * separation / 2], s: [0.006, 0.76, 0.037] }; });
    c.batch(slit, c.unitBox(), p.light, apertureLights);
    var screen = c.part(c.body, 'interference-observation-screen', [1.66, 0.19, 0], [0.3, 0, 0]);
    c.box(screen, 0.095, 1.53, 1.55, p.silver);
    c.box(screen, 0.37, 0.15, 1.12, p.dark, [0, -0.81, 0]);
    var fringe = c.shader({
      uniforms: { uColor: { value: new T.Color(c.accent) }, uTime: { value: 0 }, uWavelength: { value: wavelength }, uSeparation: { value: separation } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'precision highp float; uniform vec3 uColor; uniform float uTime; uniform float uWavelength; uniform float uSeparation; varying vec2 vUv; void main(){float x=(vUv.x-0.5)*2.0;float phase=x*24.0*uSeparation/uWavelength;float envelope=exp(-x*x*3.5);float fringes=pow(cos(phase),2.0)*envelope;float vertical=exp(-pow((vUv.y-0.5)*2.0,4.0)*1.8);float onset=0.96+0.04*cos(uTime*1.4);vec3 result=vec3(0.008,0.018,0.025)+uColor*fringes*vertical*onset;gl_FragColor=vec4(result,1.0);}'
    });
    c.mesh(screen, c.geometry('optical-screen', function () { return new T.PlaneGeometry(1.39, 1.37); }), fringe, [-0.052, 0, 0], [0, -Math.PI / 2, 0]);
    var rays = c.part(c.body, 'qualitative-light-paths');
    rays.visible = c.params.beam !== false;
    c.rods(rays, beamMaterial, [c.rodItem([-1.08, 0.19, 0], [-0.105, 0.19, 0], 0.015)]);
    c.rods(rays, beamGlow, [c.rodItem([-1.08, 0.19, 0], [-0.105, 0.19, 0], 0.048)]);
    [-1, 1].forEach(function (sign) {
      c.rods(rays, beamMaterial, [c.rodItem([-0.027, 0.19, sign * separation / 2], [1.601, 0.19, 0], 0.01)]);
      c.rods(rays, beamGlow, [-0.48, 0.48].map(function (end) { return c.rodItem([-0.027, 0.19, sign * separation / 2], [1.601, 0.19, end], 0.017); }));
    });
    var packets = c.batch(rays, c.sphere(0.025), p.light, Array.from({ length: 12 }, function () { return {}; }), true);
    c.movingPoints(packets, [[-1.06, 0.19, -separation / 2], [1.59, 0.19, separation / 2]], 0.025);
    c.port(c.body, 'mount', [0, -0.87, 0], [0, -1, 0], 'support');
    c.port(laser, 'beam-origin', [0.4135, 0.18, 0], [1, 0, 0], 'optical-axis');
    c.animate(function (t, e) {
      fringe.uniforms.uTime.value = t * speed;
      rays.visible = c.params.beam !== false && e < 0.02;
      for (var i = 0; i < 12; i++) {
        var phase = ((t * speed * 0.34 + i / 12) % 1 + 1) % 1;
        packets.setMatrixAt(i, c.matrix({ p: [-1.06 + phase * 2.65, 0.19, phase < 0.37 ? 0 : (i % 2 ? 1 : -1) * separation / 2 * (1 - phase) / 0.63] }));
      }
      packets.instanceMatrix.needsUpdate = true;
    });
    c.root.userData.representation = 'Qualitative double-slit interference; parameter units are illustrative, not calibrated laboratory predictions.';
  }

  function waveSurface(c) {
    var T = c.T, p = c.palette;
    var amplitude = number(c.params, 'amplitude', 0.18, 0.025, 0.34);
    var wavelength = number(c.params, 'wavelength', 0.73, 0.28, 1.8);
    var frequency = number(c.params, 'frequency', 0.75, 0.1, 3);
    var separation = number(c.params, 'separation', 1.15, 0.35, 2.3);
    var speed = number(c.params, 'speed', 1, -5, 5);
    var mode = c.params.mode === 'plane' ? 0 : c.params.mode === 'single' ? 1 : 2;
    var surface = c.part(c.body, 'wave-field', [0, 0, 0], [0, 0.65, 0]);
    var material = c.shader({
      uniforms: { uTime: { value: 0 }, uAmplitude: { value: amplitude }, uWavelength: { value: wavelength }, uFrequency: { value: frequency }, uSeparation: { value: separation }, uMode: { value: mode }, uColor: { value: new T.Color(c.color) }, uAccent: { value: new T.Color(c.accent) } },
      vertexShader: [
        'uniform float uTime,uAmplitude,uWavelength,uFrequency,uSeparation,uMode;',
        'varying vec3 vNormal,vView;varying vec2 vXZ;varying float vHeight;',
        'void main(){vec2 q=position.xz;float k=6.28318530718/uWavelength;float phase=uTime*uFrequency*6.28318530718;',
        'vec2 a=q-vec2(-uSeparation*0.5,-0.65);vec2 b=q-vec2(uSeparation*0.5,-0.65);float da=max(length(a),0.035);float db=max(length(b),0.035);',
        'float wa=sin(k*da-phase);float wb=sin(k*db-phase);float height;vec2 gradient;',
        'if(uMode<0.5){height=sin(k*q.y-phase);gradient=vec2(0.0,k*cos(k*q.y-phase));}',
        'else if(uMode<1.5){height=wa;gradient=k*cos(k*da-phase)*a/da;}',
        'else{height=(wa+wb)*0.5;gradient=k*(cos(k*da-phase)*a/da+cos(k*db-phase)*b/db)*0.5;}',
        'vec3 displaced=position+vec3(0.0,height*uAmplitude,0.0);vec4 mv=modelViewMatrix*vec4(displaced,1.0);vNormal=normalize(normalMatrix*vec3(-gradient.x*uAmplitude,1.0,-gradient.y*uAmplitude));vView=-mv.xyz;vXZ=q;vHeight=height;gl_Position=projectionMatrix*mv;}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;uniform vec3 uColor,uAccent;varying vec3 vNormal,vView;varying vec2 vXZ;varying float vHeight;',
        'void main(){vec3 n=normalize(vNormal);vec3 view=normalize(vView);if(!gl_FrontFacing)n=-n;float diffuse=max(dot(n,normalize(vec3(-0.4,0.85,0.65))),0.0);',
        'float rim=pow(1.0-abs(dot(n,view)),3.0);float specular=pow(max(dot(reflect(-normalize(vec3(-0.4,0.85,0.65)),n),view),0.0),55.0);',
        'vec2 cell=abs(sin(vXZ*18.0));float grid=1.0-smoothstep(0.035,0.095,min(cell.x,cell.y));float crest=smoothstep(0.48,1.0,vHeight);',
        'vec3 color=mix(uColor*0.16,uAccent*0.75,(vHeight+1.0)*0.5)*(0.38+diffuse*0.65)+uAccent*(crest*0.28+rim*0.38)+vec3(specular*0.65)+uAccent*grid*0.07;gl_FragColor=vec4(color,1.0);}'
      ].join('\n'),
      side: T.DoubleSide
    });
    var shape = c.geometry('displaced-wave-grid', function () {
      var geometry = new T.PlaneGeometry(3.72, 2.9, 48 + c.detail * 24, 32 + c.detail * 20);
      geometry.rotateX(-Math.PI / 2);
      geometry.computeBoundingBox();
      geometry.boundingBox.min.y = -amplitude;
      geometry.boundingBox.max.y = amplitude;
      geometry.boundingSphere = new T.Sphere(new T.Vector3(), Math.hypot(1.86, 1.45, amplitude));
      geometry.userData.displacedBounds = true;
      return geometry;
    });
    c.mesh(surface, shape, material);
    c.box(c.body, 4.02, 0.16, 3.2, p.dark, [0, -0.5, 0]);
    [[-1.96, 0, 0], [1.96, 0, 0]].forEach(function (position) { c.box(c.body, 0.105, 0.38, 3.16, p.metal, position, 0.018); });
    [[0, 0, -1.55], [0, 0, 1.55]].forEach(function (position) { c.box(c.body, 3.84, 0.38, 0.105, p.metal, position, 0.018); });
    var ticks = [];
    for (var i = 0; i < 27; i++) ticks.push({ p: [-1.82 + i * 0.14, 0.197, 1.548], s: [0.008, 0.006, i % 5 === 0 ? 0.072 : 0.034] });
    c.batch(c.body, c.unitBox(), p.silver, ticks);
    if (mode > 0) {
      var count = mode === 1 ? 1 : 2;
      for (var sourceIndex = 0; sourceIndex < count; sourceIndex++) {
        var x = sourceIndex === 0 ? -separation / 2 : separation / 2;
        var source = c.part(surface, 'coherent-source-' + (sourceIndex + 1), [x, 0.05, -0.65]);
        c.mesh(source, c.cylinder(0.055, 0.58), p.gold, [0, 0.14, 0]);
        c.ring(source, 0.13, 0.018, p.light, [0, 0, 0], [Math.PI / 2, 0, 0]);
        c.mesh(source, c.sphere(0.074), p.light, [0, 0.46, 0]);
      }
    }
    c.animate(function (t) { material.uniforms.uTime.value = t * speed; });
    c.port(c.body, 'mount', [0, -0.58, 0], [0, -1, 0], 'support');
    c.root.userData.representation = 'Qualitative optical wave-height visualization, not a physical water or electromagnetic field solver.';
  }

  function flange(c, parent, name, position, normal, bore) {
    var T = c.T, p = c.palette, group = c.part(parent, name, position);
    group.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3().fromArray(normal).normalize());
    var outer = bore + 0.18, height = 0.11;
    var geometry = c.geometry('flange:' + bore, function () {
      return new T.LatheGeometry([[bore, -height / 2], [outer - 0.018, -height / 2], [outer, -height / 2 + 0.018], [outer, height / 2 - 0.018], [outer - 0.018, height / 2], [bore, height / 2], [bore, -height / 2]].map(function (v) { return new T.Vector2(v[0], v[1]); }), 24 + c.detail * 12);
    });
    c.mesh(group, geometry, p.silver);
    c.ring(group, bore + 0.024, 0.013, p.black, [0, height / 2 + 0.004, 0], [Math.PI / 2, 0, 0]);
    var bolts = [], washers = [];
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * TAU, r = bore + 0.115;
      bolts.push({ p: [Math.cos(a) * r, 0.077, Math.sin(a) * r] });
      washers.push({ p: [Math.cos(a) * r, 0.059, Math.sin(a) * r] });
    }
    c.batch(group, c.cylinder(0.034, 0.044, 0.034, 6), p.dark, bolts);
    c.batch(group, c.cylinder(0.047, 0.009), p.metal, washers);
    return group;
  }

  function hollowSegment(c, parent, start, end, bore, wall, material) {
    var T = c.T, a = new T.Vector3().fromArray(start), b = new T.Vector3().fromArray(end);
    var height = a.distanceTo(b), group = c.part(parent, 'hollow-pipe-segment', a.clone().add(b).multiplyScalar(0.5).toArray());
    group.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    var shape = c.geometry('hollow-pipe:' + [bore, wall, height].join(':'), function () {
      return new T.LatheGeometry([[bore, -height / 2], [bore + wall, -height / 2], [bore + wall, height / 2], [bore, height / 2], [bore, -height / 2]].map(function (v) { return new T.Vector2(v[0], v[1]); }), 20 + c.detail * 8);
    });
    c.mesh(group, shape, material);
    return group;
  }

  function valve(c) {
    var T = c.T, p = c.palette, fixed = c.part(c.body, 'fixed-valve-body');
    var painted = c.standard('#315c67', 0.22, 0.61), bore = 0.39;
    var shell = c.geometry('sectioned-valve-casting', function () {
      var profile = [[0.39, -0.91], [0.49, -0.91], [0.49, -0.55], [0.64, -0.32], [0.69, 0], [0.64, 0.32], [0.49, 0.55], [0.49, 0.91], [0.39, 0.91], [0.39, 0.51], [0.53, 0.28], [0.57, 0], [0.53, -0.28], [0.39, -0.51], [0.39, -0.91]];
      return new T.LatheGeometry(profile.map(function (v) { return new T.Vector2(v[0], v[1]); }), 48 + c.detail * 12, Math.PI * 0.13, Math.PI * 1.7);
    });
    c.mesh(fixed, shell, painted, null, [0, 0, -Math.PI / 2]);
    [-1, 1].forEach(function (side) {
      hollowSegment(c, fixed, [side * 0.91, 0, 0], [side * 1.175, 0, 0], bore, 0.09, painted);
      flange(c, fixed, side < 0 ? 'inlet-flange' : 'outlet-flange', [side * 1.23, 0, 0], [side, 0, 0], bore);
      c.port(fixed, side < 0 ? 'inlet' : 'outlet', [side * 1.285, 0, 0], [side, 0, 0], 'fluid');
    });
    var gate = c.part(fixed, 'obturator-and-stem');
    c.mesh(gate, c.cylinder(0.375, 0.065), p.gold, null, [0, 0, Math.PI / 2]);
    c.mesh(gate, c.cylinder(0.085, 1.2), p.silver, [0, 0.36, 0]);
    gate.rotation.y = c.params.opening * Math.PI / 2;
    var bonnet = c.part(c.body, 'bonnet-and-packing', [0, 0.73, 0], [0, 0.28, 0]);
    c.mesh(bonnet, c.cylinder(0.23, 0.28), painted);
    c.mesh(bonnet, c.cylinder(0.3, 0.07), p.silver, [0, 0.15, 0]);
    c.mesh(bonnet, c.cylinder(0.145, 0.085, 0.145, 6), p.gold, [0, 0.226, 0]);
    var actuator = c.part(c.body, 'actuator', [0, 1.39, 0], [0, 0.74, 0]);
    c.mesh(actuator, c.cylinder(0.075, 0.38), p.silver, [0, -0.33, 0]);
    if (c.params.actuator === 'manual') {
      c.ring(actuator, 0.57, 0.056, painted, [0, 0.05, 0], [Math.PI / 2, 0, 0]);
      var spokes = [];
      for (var spoke = 0; spoke < 6; spoke++) {
        var angle = spoke / 6 * TAU;
        spokes.push(c.rodItem([0, 0.05, 0], [0.54 * Math.cos(angle), 0.05, 0.54 * Math.sin(angle)], 0.034));
      }
      c.rods(actuator, p.metal, spokes);
      c.mesh(actuator, c.cylinder(0.12, 0.11, 0.12, 6), p.gold, [0, 0.05, 0]);
      actuator.rotation.y = c.params.opening * Math.PI;
    } else {
      c.box(actuator, 1.06, 0.61, 0.83, painted, [0, 0, 0], 0.075);
      c.box(actuator, 0.82, 0.07, 0.69, p.dark, [0, 0.315, 0], 0.024);
      var fins = [], screws = [];
      for (var fin = 0; fin < 8; fin++) {
        fins.push({ p: [-0.42 + fin * 0.12, -0.03, -0.435] });
        fins.push({ p: [-0.42 + fin * 0.12, -0.03, 0.435] });
      }
      c.batch(actuator, c.roundedBox(0.039, 0.42, 0.065, 0.009), p.metal, fins);
      c.box(actuator, 0.43, 0.2, 0.024, p.black, [0, 0.08, 0.477], 0.013);
      c.box(actuator, 0.31 * c.params.opening + 0.014, 0.022, 0.027, c.glow(c.accent, 0.35), [0, 0.08, 0.497], 0.003);
      [-0.43, 0.43].forEach(function (x) { [-0.32, 0.32].forEach(function (z) { screws.push({ p: [x, 0.312, z] }); }); });
      c.batch(actuator, c.cylinder(0.031, 0.028, 0.031, 6), p.silver, screws);
      c.mesh(actuator, c.cylinder(0.1, 0.15, 0.1, 6), p.black, [0.58, -0.04, 0], [0, 0, Math.PI / 2]);
    }
    c.supportSurface('mount-base', c.box(fixed, 1.96, 0.14, 1.37, p.dark, [0, -0.99, 0], 0.035));
    var struts = [], feetBolts = [];
    [-0.66, 0.66].forEach(function (x) {
      [-0.47, 0.47].forEach(function (z) {
        struts.push(c.rodItem([x, -0.91, z], [x * 0.72, -0.44, z * 0.68], 0.062));
        feetBolts.push({ p: [x, -0.894, z] });
      });
    });
    c.rods(fixed, p.metal, struts);
    c.batch(fixed, c.cylinder(0.054, 0.045, 0.054, 6), p.silver, feetBolts);
    c.port(fixed, 'mount', [0, -1.06, 0], [0, -1, 0], 'support');
  }

  function pipeAssembly(c) {
    var T = c.T, p = c.palette, length = c.params.length, radius = c.params.radius;
    var points = c.params.layout === 'straight' ? [[-length / 2, 0, 0], [length / 2, 0, 0]] : c.params.layout === 'elbow' ? [[-length / 2, 0, 0], [0, 0, 0], [length * 0.26, 0, length * 0.08], [length * 0.35, 0, length * 0.28], [length * 0.35, 0, length * 0.58]] : [[-length / 2, 0, -length * 0.23], [length * 0.18, 0, -length * 0.23], [length * 0.42, 0, 0], [length * 0.18, 0, length * 0.45], [-length / 2, 0, length * 0.45]];
    var fixed = c.part(c.body, 'fixed-pipe-and-flanges');
    var curve = new T.CatmullRomCurve3(points.map(function (v) { return new T.Vector3().fromArray(v); }), false, 'centripetal');
    var trim = 0.055 / curve.getLength(), pipeCurve = new T.Curve();
    // The tube ends at the flange's rear face; overlapping bore walls flicker in close-ups.
    pipeCurve.getPoint = function (t, target) { return curve.getPointAt(trim + t * (1 - 2 * trim), target); };
    var segments = 40 + c.detail * 24;
    var outer = c.geometry('formed-pipe-outer', function () { return new T.TubeGeometry(pipeCurve, segments, radius + 0.028, 16 + c.detail * 8, false); });
    var inner = c.geometry('formed-pipe-inner', function () { return new T.TubeGeometry(pipeCurve, segments, radius, 16 + c.detail * 8, false); });
    c.mesh(fixed, outer, c.standard('#7d929e', 0.83, 0.38));
    c.mesh(fixed, inner, c.standard('#354750', 0.68, 0.53, { side: T.BackSide }));
    [0, 1].forEach(function (t) {
      var position = curve.getPoint(t), direction = curve.getTangent(t).multiplyScalar(t ? 1 : -1);
      flange(c, fixed, t ? 'outlet-flange' : 'inlet-flange', position.toArray(), direction.toArray(), radius);
      c.port(fixed, t ? 'outlet' : 'inlet', position.clone().addScaledVector(direction, 0.055).toArray(), direction.toArray(), 'fluid');
    });
    [0.19, 0.74].forEach(function (t, index) {
      var position = curve.getPoint(t), tangent = curve.getTangent(t);
      var lateral = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), tangent).normalize();
      var stand = c.part(c.body, 'pipe-support-' + (index + 1), [position.x, -0.49, position.z]);
      stand.rotation.y = Math.atan2(-lateral.z, lateral.x);
      c.supportSurface('support-base-' + (index + 1), c.box(stand, 0.91, 0.11, 0.51, p.dark, [0, -0.38, 0], 0.025)).name = 'support-base';
      [-1, 1].forEach(function (side) {
        c.box(stand, 0.06, 0.85, 0.18, p.silver, [side * (radius + 0.113), 0.1, 0], 0.008).name = 'support-upright-' + side;
        c.mesh(stand, c.cylinder(0.045, 0.04, 0.045, 6), p.silver, [side * 0.34, -0.31, 0]);
      });
      c.box(stand, 2 * (radius + 0.113), 0.06, 0.17, p.silver, [0, 0.423 - radius, 0], 0.009).name = 'support-cross-member';
      c.box(stand, radius * 0.9, 0.032, 0.17, p.black, [0, 0.45 - radius, 0], 0.006);
      var saddle = c.part(c.body, 'removable-pipe-clamp-' + (index + 1), position.toArray(), [0, radius + 0.48, 0]);
      saddle.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tangent);
      c.ring(saddle, radius + 0.063, 0.031, p.dark).name = 'retaining-band';
      c.ring(saddle, radius + 0.048, 0.017, p.silver, [0, 0, 0.04]);
    });
    [0.38, 0.61].forEach(function (t) {
      var seam = c.part(fixed, 'weld-seam', curve.getPoint(t).toArray());
      seam.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), curve.getTangent(t));
      c.ring(seam, radius + 0.029, 0.009, p.dark);
    });
  }

  function circuitBoard(c) {
    var T = c.T, p = c.palette, width = c.params.width, depth = c.params.depth;
    var fixed = c.part(c.body, 'pcb-and-fixed-sockets');
    var soldermask = c.standard('#164b40', 0.04, 0.63), copper = c.standard('#ba9b60', 0.8, 0.41);
    var board = c.geometry('drilled-pcb', function () {
      var x = width / 2, z = depth / 2, cut = 0.12, shape = new T.Shape();
      shape.moveTo(-x + cut, -z); shape.lineTo(x - cut, -z); shape.lineTo(x, -z + cut); shape.lineTo(x, z - cut); shape.lineTo(x - cut, z); shape.lineTo(-x + cut, z); shape.lineTo(-x, z - cut); shape.lineTo(-x, -z + cut); shape.closePath();
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
        var hole = new T.Path(); hole.absarc(sx * (x - 0.23), sz * (z - 0.23), 0.056, 0, TAU, true); shape.holes.push(hole);
      }); });
      var geometry = new T.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, steps: 1, curveSegments: 12 });
      geometry.rotateX(-Math.PI / 2); return geometry;
    });
    c.mesh(fixed, board, soldermask);
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
      var position = [sx * (width / 2 - 0.23), 0.13, sz * (depth / 2 - 0.23)];
      c.ring(fixed, 0.085, 0.012, copper, position, [Math.PI / 2, 0, 0]);
      c.mesh(fixed, c.cylinder(0.083, 0.28, 0.083, 6), p.silver, [position[0], -0.14, position[2]]);
      c.port(fixed, 'mount-' + (sx < 0 ? 'left' : 'right') + '-' + (sz < 0 ? 'back' : 'front'), [position[0], -0.28, position[2]], [0, -1, 0], 'support');
    }); });
    var socketX = -width * 0.19, socketSize = Math.min(1.6, depth * 0.47);
    c.box(fixed, socketSize, 0.12, socketSize, p.black, [socketX, 0.18, 0], 0.018);
    var pins = [], gridSize = 9;
    for (var ix = 0; ix < gridSize; ix++) for (var iz = 0; iz < gridSize; iz++) {
      pins.push({ p: [socketX + (ix - 4) * socketSize * 0.081, 0.252, (iz - 4) * socketSize * 0.081] });
    }
    c.batch(fixed, c.cylinder(0.018, 0.042, 0.012, 8), copper, pins);
    [[socketX, 0.26, -socketSize * 0.46], [socketX, 0.26, socketSize * 0.46]].forEach(function (v) { c.box(fixed, socketSize, 0.12, 0.074, p.silver, v, 0.01); });
    [[socketX - socketSize * 0.46, 0.26, 0], [socketX + socketSize * 0.46, 0.26, 0]].forEach(function (v) { c.box(fixed, 0.074, 0.12, socketSize, p.silver, v, 0.01); });
    c.tube(fixed, [[socketX + socketSize * 0.58, 0.19, -0.5], [socketX + socketSize * 0.6, 0.22, 0.5], [socketX + socketSize * 0.47, 0.26, 0.65]], 0.022, p.silver);
    c.port(fixed, 'cpu-socket', [socketX, 0.273, 0], [0, 1, 0], 'component-mount');
    var traces = [], vias = [], silk = [], slotCount = c.params.slots;
    for (var slot = 0; slot < slotCount; slot++) {
      var x = width * 0.16 + slot / Math.max(1, slotCount - 1) * width * 0.23;
      var slotLength = depth * 0.62;
      c.box(fixed, 0.16, 0.17, slotLength, p.black, [x, 0.205, 0], 0.014);
      c.box(fixed, 0.06, 0.04, slotLength - 0.15, p.dark, [x, 0.303, 0], 0.004);
      var contacts = [];
      for (var contact = 0; contact < 28; contact++) {
        var z = -slotLength * 0.44 + contact / 27 * slotLength * 0.88;
        [-1, 1].forEach(function (sign) { contacts.push({ p: [x + sign * 0.068, 0.282, z] }); });
      }
      c.batch(fixed, c.unitBox(), copper, contacts.map(function (v) { return { p: v.p, s: [0.018, 0.035, 0.025] }; }));
      [-1, 1].forEach(function (sign) { c.box(fixed, 0.25, 0.23, 0.14, p.ceramic, [x, 0.27, sign * (slotLength / 2 + 0.05)], 0.019); });
      c.port(fixed, 'slot-' + (slot + 1), [x, 0.323, 0], [0, 1, 0], 'component-mount');
      for (var lane = 0; lane < 9; lane++) {
        var z = (lane - 4) * 0.105, start = [socketX + socketSize * 0.5, 0.132, z];
        var bend = width * 0.035 + lane * 0.025;
        var route = [start, [bend, 0.132, z], [bend + 0.1, 0.132, z + (slot + 1) * 0.04], [x - 0.11, 0.132, z + (slot + 1) * 0.04]];
        for (var segment = 0; segment < route.length - 1; segment++) traces.push(c.rodItem(route[segment], route[segment + 1], 0.006));
        vias.push({ p: route[route.length - 1] });
      }
    }
    c.rods(fixed, copper, traces);
    c.batch(fixed, c.cylinder(0.02, 0.009, 0.02, 10), p.silver, vias);
    var ceramicChips = [], solderPads = [], capacitors = [];
    for (var component = 0; component < 18; component++) {
      var cx = -width * 0.38 + component / 17 * width * 0.76;
      var cz = (component % 2 ? -1 : 1) * depth * 0.39;
      ceramicChips.push({ p: [cx, 0.165, cz] });
      [-1, 1].forEach(function (sign) { solderPads.push({ p: [cx + sign * 0.052, 0.158, cz] }); });
      silk.push({ p: [cx, 0.124, cz + 0.075], s: [0.14, 0.005, 0.01] });
      if (component % 3 === 0) capacitors.push({ p: [cx, 0.31, cz - 0.16] });
    }
    c.batch(fixed, c.roundedBox(0.087, 0.052, 0.046, 0.006), p.ceramic, ceramicChips);
    c.batch(fixed, c.roundedBox(0.03, 0.03, 0.06, 0.003), p.silver, solderPads);
    c.batch(fixed, c.unitBox(), c.standard('#adc0a8', 0, 0.89), silk);
    c.batch(fixed, c.cylinder(0.075, 0.33), p.dark, capacitors);
    c.batch(fixed, c.cylinder(0.06, 0.012), p.silver, capacitors.map(function (item) { return { p: [item.p[0], 0.48, item.p[2]] }; }));
    [-1, 1].forEach(function (side) {
      c.box(fixed, 0.21, 0.24, 0.66, p.black, [side * (width / 2 - 0.105), 0.24, 0], 0.019);
      for (var pin = 0; pin < 6; pin++) c.mesh(fixed, c.cylinder(0.02, 0.07), copper, [side * (width / 2 - 0.1), 0.39, (pin - 2.5) * 0.09]);
      c.port(fixed, side < 0 ? 'input' : 'output', [side * width / 2, 0.24, 0], [side, 0, 0], 'logical-signal');
    });
  }

  function logicStack(c) {
    var p = c.palette, columns = c.params.columns, rows = c.params.rows, layers = c.params.layers;
    var width = 0.63 * columns + 0.38, depth = 0.58 * rows + 0.52;
    var base = c.part(c.body, 'fixed-logical-stack-base');
    c.box(base, width + 0.22, 0.19, depth + 0.24, p.dark, [0, -0.12, 0], 0.045);
    [-1, 1].forEach(function (side) {
      c.box(base, 0.18, 0.13, 0.52, p.silver, [side * (width / 2 + 0.04), 0.04, 0], 0.018);
      c.port(base, side < 0 ? 'input' : 'output', [side * (width / 2 + 0.13), 0.04, 0], [side, 0, 0], 'logical-signal');
    });
    c.port(base, 'mount', [0, -0.215, 0], [0, -1, 0], 'support');
    var layerColors = ['#396477', '#657558', '#686184', '#886952', '#506e78', '#7b596c'];
    for (var layerIndex = 0; layerIndex < layers; layerIndex++) {
      var y = 0.24 + layerIndex * 0.46;
      var layer = c.part(c.body, 'logical-layer-' + (layerIndex + 1), [0, y, 0], [0, 0.26 + layerIndex * 0.37, layerIndex % 2 ? -0.12 : 0.12]);
      var polymer = c.standard(layerColors[layerIndex], 0.03, 0.64);
      c.box(layer, width, 0.11, depth, polymer, [0, 0, 0], 0.026);
      c.box(layer, width, 0.05, 0.045, p.silver, [0, 0.078, -depth / 2 + 0.03], 0.004);
      c.box(layer, width, 0.05, 0.045, p.silver, [0, 0.078, depth / 2 - 0.03], 0.004);
      var cells = [], separators = [], counts = [];
      for (var row = 0; row < rows; row++) for (var column = 0; column < columns; column++) {
        var x = (column - (columns - 1) / 2) * 0.63, z = (row - (rows - 1) / 2) * 0.58;
        cells.push({ p: [x, 0.075, z] });
        c.port(layer, 'layer-' + (layerIndex + 1) + '-cell-' + (row * columns + column + 1), [x, 0.092, z], [0, 1, 0], 'logical-marker-slot');
        if (layerIndex + 1 === c.params.activeLayer && row * columns + column + 1 === c.params.activeCell) {
          c.box(layer, 0.4, 0.046, 0.29, c.standard(c.accent, 0.05, 0.43, { emissive: c.accent, emissiveIntensity: 0.16 }), [x, 0.116, z], 0.012);
          c.box(layer, 0.2, 0.005, 0.025, p.dark, [x, 0.142, z], 0.002);
        }
      }
      for (var divider = 1; divider < columns; divider++) separators.push({ p: [(divider - columns / 2) * 0.63, 0.115, 0], s: [0.024, 0.075, depth - 0.22] });
      for (var horizontal = 1; horizontal < rows; horizontal++) separators.push({ p: [0, 0.115, (horizontal - rows / 2) * 0.58], s: [width - 0.22, 0.075, 0.024] });
      c.batch(layer, c.roundedBox(0.52, 0.032, 0.44, 0.009), p.black, cells);
      c.batch(layer, c.unitBox(), polymer, separators);
      c.box(layer, 0.41, 0.15, 0.075, p.dark, [-width / 2 + 0.26, 0.003, depth / 2 + 0.025], 0.012);
      for (var tick = 0; tick <= layerIndex; tick++) counts.push({ p: [-width / 2 + 0.1 + tick * 0.055, 0.002, depth / 2 + 0.067], s: [0.018, 0.073, 0.007] });
      c.batch(layer, c.unitBox(), p.ceramic, counts);
      c.port(layer, 'layer-' + (layerIndex + 1), [0, 0, depth / 2 + 0.03], [0, 0, 1], 'logical-layer');
    }
  }

  // Reusable hardware geometry, not an event-specific scene or animation.
  // Signal paths, history, state changes and camera work are still generated as SceneIR.
  function usbDrive(c) {
    var p = c.palette, fixed = c.part(c.body, 'removable-storage-body');
    c.box(fixed, .82, .28, 1.58, p.dark, [0, 0, -.22], .075);
    c.box(fixed, .75, .02, 1.27, p.metal, [0, .147, -.24], .007);
    c.box(fixed, .16, .013, .5, c.standard('#83939b',.12,.65), [0, .166, -.22], .003);
    c.ring(fixed, .115, .038, p.silver, [0, 0, -1.07], [Math.PI / 2, 0, 0]);
    var plug = c.part(fixed, 'metal-plug-and-recessed-contacts', [0, 0, .84]);
    [-1, 1].forEach(function (side) {
      c.box(plug, .59, .025, .74, p.silver, [0, side * .1, 0], .004);
      c.box(plug, .025, .2, .74, p.silver, [side * .295, 0, 0], .004);
    });
    c.box(plug, .52, .058, .62, p.black, [0, -.018, -.037], .01);
    var contacts = [];
    for (var i = 0; i < 4; i++) contacts.push({p:[(i-1.5)*.112, .018, .053],s:[.068,.009,.37]});
    c.batch(plug,c.unitBox(),p.gold,contacts);
    c.port(fixed,'connector',[0,0,1.21],[0,0,1],'removable-media-plug');
    c.port(fixed,'signal',[0,.18,-.2],[0,1,0],'conceptual-signal');
  }

  function computerWorkstation(c) {
    var p=c.palette, fixed=c.part(c.body,'computer-and-peripherals');
    var polymer=c.standard('#374654',.16,.54), screen=c.standard('#091b28',.05,.27,{emissive:'#123047',emissiveIntensity:.16});
    var monitor=c.part(fixed,'monitor-and-fixed-pedestal',[-.3,.92,0]);
    c.box(monitor,1.98,1.25,.19,polymer,[0,0,0],.055);
    c.box(monitor,1.77,1.03,.023,screen,[0,.02,.113],.008);
    c.box(monitor,.63,.055,.065,p.dark,[0,-.526,.12],.008);
    c.mesh(monitor,c.sphere(.021),c.glow('#77d2ae',.28),[.83,-.526,.13]);
    c.box(fixed,.16,1.13,.17,p.silver,[-.3,-.24,-.033],.028);
    c.supportSurface('monitor-foot',c.box(fixed,1.12,.09,.77,polymer,[-.3,-.84,0],.035));
    var keyboard=c.part(fixed,'keyboard',[-.3,-.77,.86]);
    c.box(keyboard,1.75,.095,.55,polymer,[0,0,0],.038);
    var keys=[];
    for(var row=0;row<4;row++)for(var col=0;col<14;col++)keys.push({p:[(col-6.5)*.111,.063,(row-1.5)*.113]});
    var keyMaterial=c.standard('#50616e',.08,.7);
    c.batch(keyboard,c.roundedBox(.087,.034,.087,.008),keyMaterial,keys);
    c.box(keyboard,.47,.034,.075,keyMaterial,[0,.063,.233],.008);
    c.mesh(fixed,c.sphere(.17),polymer,[.94,-.745,.86],null,[.72,.39,1.12]);
    c.box(fixed,.024,.024,.094,p.dark,[.94,-.673,.843],.004);
    if(c.params.tower){
      var tower=c.part(fixed,'desktop-tower',[1.5,-.05,-.11]);
      c.box(tower,.77,1.59,1.21,polymer,[0,0,0],.048);
      c.box(tower,.68,1.49,.034,p.dark,[0,0,.617],.022);
      c.box(tower,.56,.11,.04,p.black,[0,.53,.644],.01);
      c.mesh(tower,c.cylinder(.068,.031),p.silver,[0,.31,.656],[Math.PI/2,0,0]);
      c.ring(tower,.046,.008,c.glow('#53bfcd',.25),[0,.31,.676]);
      var vents=[];
      for(var v=0;v<12;v++)vents.push({p:[0,-.55+v*.035,.65],s:[.5,.011,.021]});
      c.batch(tower,c.unitBox(),p.black,vents);
      [-1,1].forEach(function(side){
        c.box(tower,.17,.065,.025,p.silver,[side*.19,.13,.652],.008);
        c.box(tower,.127,.033,.03,p.black,[side*.19,.13,.671],.004);
        [-1,1].forEach(function(z){c.supportSurface('tower-foot-'+side+'-'+z,c.box(tower,.13,.08,.19,p.black,[side*.265,-.834,z*.42],.016));});
      });
      c.port(fixed,'usb',[1.31,.08,.578],[0,0,1],'removable-media-socket');
      c.port(fixed,'network',[1.88,-.34,-.35],[1,0,0],'network');
      c.tube(fixed,[[1.1,-.2,-.6],[.9,-.55,-.67],[-.3,-.6,-.25],[-.3,.8,-.11]],.023,p.black);
    }else{
      c.port(fixed,'usb',[.635,.55,.12],[1,0,0],'removable-media-socket');
      c.port(fixed,'network',[-.3,-.6,-.14],[0,0,-1],'network');
    }
    c.port(fixed,'display',[-.3,.94,.135],[0,0,1],'screen-surface');
    c.port(fixed,'display-top-left',[-1.17,1.44,.135],[0,0,1],'screen-corner');
    c.port(fixed,'display-bottom-right',[.57,.44,.135],[0,0,1],'screen-corner');
  }

  function industrialController(c) {
    var p=c.palette, fixed=c.part(c.body,'controller-fixed-rail-and-modules'), count=c.params.modules;
    var width=count*.57+.25, polymer=c.standard('#728789',.08,.64), terminal=c.standard('#3f6860',.08,.63);
    c.box(fixed,width,.22,.14,p.silver,[0,0,-.38],.018);
    [-1,1].forEach(function(side){c.box(fixed,width,.058,.19,p.metal,[0,side*.145,-.37],.008);});
    var screws=[],slots=[],lenses=[],vents=[],nameplate=c.standard('#869496',.04,.7);
    for(var m=0;m<count;m++){
      var x=(m-(count-1)/2)*.57, unit=c.part(fixed,'fixed-module-'+m,[x,0,0]);
      c.box(unit,.53,1.32,.65,polymer,[0,0,0],.034);
      c.box(unit,.42,.67,.021,p.dark,[0,.03,.338],.008);
      c.box(unit,.34,.07,.012,nameplate,[0,.3,.355],.004);
      [-1,1].forEach(function(side){
        c.box(unit,.47,.195,.24,terminal,[0,side*.61,.266],.013);
        for(var k=0;k<4;k++){
          screws.push({p:[x+(k-1.5)*.105,side*.61,.401],r:[Math.PI/2,0,0]});
          slots.push({p:[x+(k-1.5)*.105,side*.61,.414],s:[.044,.009,.006]});
        }
      });
      for(var light=0;light<3;light++)lenses.push({p:[x-.125+light*.12,.14,.36]});
      for(var v=0;v<5;v++)vents.push({p:[x,-.1-v*.036,.354],s:[.32,.008,.008]});
      c.port(unit,'module-'+(m+1),[0,.02,.37],[0,0,1],'module-face');
    }
    c.batch(fixed,c.cylinder(.03,.021,.03,12),p.silver,screws);
    c.batch(fixed,c.unitBox(),p.dark,slots);
    c.batch(fixed,c.sphere(.018),c.glow('#86b99c',.18),lenses);
    c.batch(fixed,c.unitBox(),p.black,vents);
    c.port(fixed,'network',[-width/2,.08,.12],[-1,0,0],'network');
    c.port(fixed,'output',[width/2,-.3,.25],[1,0,0],'control-signal');
    c.port(fixed,'logic-view',[0,0,.56],[0,0,1],'external-conceptual-logic-view');
    c.port(fixed,'mount',[0,0,-.475],[0,0,-1],'rail-mount');
  }

  function industrialDrive(c) {
    var p=c.palette, fixed=c.part(c.body,'motor-drive-enclosure'), paint=c.standard('#435f67',.18,.53);
    c.box(fixed,1.14,1.91,.94,paint,[0,0,0],.05);
    c.box(fixed,.83,1.1,.035,p.dark,[0,.17,.488],.021);
    c.box(fixed,.62,.3,.016,c.standard('#0b222b',.05,.32),[0,.42,.516],.01);
    var displayTicks=[];
    for(var tick=-2;tick<=2;tick++)displayTicks.push({p:[tick*.12,.31,.532]});
    c.batch(fixed,c.unitBox(),c.standard('#8eabb1',.08,.48),displayTicks.map(function(tick){return{p:tick.p,s:[.014,.055,.009]};}));
    var fins=[],buttons=[],screws=[];
    for(var i=0;i<10;i++)fins.push({p:[(i-4.5)*.111,0,-.56],s:[.035,1.64,.18]});
    c.batch(fixed,c.unitBox(),p.silver,fins);
    for(var y=0;y<2;y++)for(var x=0;x<3;x++)buttons.push({p:[(x-1)*.202,.025-y*.18,.526]});
    c.batch(fixed,c.cylinder(.063,.025,.063,16),c.standard('#687f87',.08,.7),buttons.map(function(b){return{p:b.p,r:[Math.PI/2,0,0]};}));
    c.box(fixed,1.02,.2,.39,p.black,[0,-.84,.32],.018);
    for(var s=0;s<6;s++)screws.push({p:[(s-2.5)*.155,-.84,.538],r:[Math.PI/2,0,0]});
    c.batch(fixed,c.cylinder(.042,.021,.042,12),p.silver,screws);
    c.supportSurface('drive-foot',c.box(fixed,1.29,.085,1.1,p.dark,[0,-1.005,-.04],.021));
    c.port(fixed,'input',[-.6,-.45,.22],[-1,0,0],'control-signal');
    c.port(fixed,'output',[.6,-.75,.22],[1,0,0],'motor-command');
    c.port(fixed,'display',[0,.42,.53],[0,0,1],'screen-surface');
  }

  function centrifugeHousing(c) {
    var T=c.T,p=c.palette,fixed=c.part(c.body,'fixed-vertical-machine'), cut=c.params.cutaway;
    var start=cut?Math.PI/2:0, arc=cut?Math.PI:TAU;
    var shell=c.geometry('vertical-cutaway-casing-'+cut,function(){
      return new T.LatheGeometry([[.47,-1.47],[.55,-1.47],[.55,1.47],[.47,1.47],[.47,-1.47]].map(function(v){return new T.Vector2(v[0],v[1]);}),48,start,arc);
    });
    c.mesh(fixed,shell,c.standard('#91a4ad',.82,.36,{side:T.DoubleSide})).name='casing-with-visible-front-opening';
    [-1,1].forEach(function(side){
      var y=side*1.43,collar=c.geometry('open-collar-'+cut,function(){return new T.LatheGeometry([[.455,-.07],[.63,-.07],[.63,.07],[.455,.07],[.455,-.07]].map(function(v){return new T.Vector2(v[0],v[1]);}),48,start,arc);});
      c.mesh(fixed,collar,p.silver,[0,y,0]);
      var bolts=[];
      for(var b=0;b<8;b++){var a=start+(b+.5)/8*arc;bolts.push({p:[.58*Math.sin(a),y+side*.083,.58*Math.cos(a)]});}
      c.batch(fixed,c.cylinder(.025,.05,.025,6),p.dark,bolts);
    });
    var motor=c.part(fixed,'fixed-motor-housing',[0,-1.72,0]);
    c.mesh(motor,c.cylinder(.52,.34),p.dark);
    c.mesh(motor,c.cylinder(.46,.055),p.silver,[0,-.195,0]);
    var fins=[];
    for(var f=0;f<16;f++){var a=f/16*TAU;fins.push({p:[.54*Math.sin(a),0,.54*Math.cos(a)],r:[0,a,0],s:[.027,.25,.065]});}
    c.batch(motor,c.unitBox(),p.metal,fins);
    c.supportSurface('machine-foot',c.box(fixed,1.46,.13,1.16,p.dark,[0,-2.03,0],.03));
    var feet=[];
    [-1,1].forEach(function(x){[-1,1].forEach(function(z){feet.push({p:[x*.58,-1.934,z*.43]});});});
    c.batch(fixed,c.cylinder(.05,.06,.05,6),p.silver,feet);
    c.box(fixed,.3,.28,.22,p.dark,[.56,-1.72,0],.02);
    c.port(fixed,'rotor-center',[0,0,0],[0,1,0],'rotor-axis');
    c.port(fixed,'rotor-top',[0,1.31,0],[0,1,0],'rotor-limit');
    c.port(fixed,'rotor-bottom',[0,-1.31,0],[0,-1,0],'rotor-limit');
    c.port(fixed,'cavity-front',[0,0,.455],[0,0,1],'cavity-radius');
    c.port(fixed,'motor',[.72,-1.72,0],[1,0,0],'motor-command');
  }

  var builders = { turbine: turbine, 'server-rack': serverRack, processor: processor, 'memory-bank': memoryBank, dna: dna, atom: atom, planet: planet, satellite: satellite, 'optical-bench': opticalBench, 'wave-surface': waveSurface, valve: valve, 'pipe-assembly': pipeAssembly, 'circuit-board': circuitBoard, 'logic-stack': logicStack, 'usb-drive': usbDrive, 'computer-workstation': computerWorkstation, 'industrial-controller': industrialController, 'industrial-drive': industrialDrive, 'centrifuge-housing': centrifugeHousing };

  globalThis.CinematicModels = Object.freeze({
    kinds: Object.freeze(kinds.slice()),
    definition: definition,
    catalog: function (THREE, kind, params) {
      var root = this.create(THREE, { model: kind, params: params, metadataOnly: true });
      var info = definition(kind), data = root.userData;
      var result = {
        kind: kind, version: 'cinematic-assets-v2', coordinateSpace: 'normalized-root', params: data.params,
        parameters: info.parameters, bounds: data.bounds, expandedBounds: data.expandedBounds, floor: data.floor,
        ports: data.ports, supportSurfaces: data.supportSurfaces, roles: info.roles, representation: info.representation,
        supportsExplode: data.supportsExplode, explodeParts: data.explodeParts,
        internalPartsAddressable: data.internalPartsAddressable, parameterMode: data.parameterMode, assemblyValidation: data.assemblyValidation,
        actionHints: [
          { property: 'position/rotation/scale', target: 'root', description: 'Transforms apply to the complete normalized assembly and its ports.' },
          { property: 'params', target: 'root', description: 'Static construction settings from parameters; recreate the model when changing them, not unsupported timeline properties.' }
        ],
        cost: data.stats
      };
      if (data.supportsExplode) result.actionHints.push({ property: 'explode', target: 'root', description: kind === 'dna' && data.params.separation === 'local' ? '0..1 opens only the selected local region of the same continuous molecule; outside stays paired. Animate 0→1→0 to open and re-pair. separationCenter and separationSpan are construction settings. Use expandedBounds. Qualitative separation, not a physical solver.' : '0..1 global separation/expansion of the listed explodeParts and their contents, controlled together; internal part names are descriptive only, never SceneIR track targets. Fixed ports remain attached to the base. Use expandedBounds when framing; not a physical simulation.' });
      root.userData.dispose();
      return JSON.parse(JSON.stringify(result));
    },
    create: function (THREE, spec) {
      if (!THREE || typeof THREE.Group !== 'function' || typeof THREE.InstancedMesh !== 'function') throw new TypeError('CinematicModels requires Three.js 0.150.1.');
      if (!spec || !Object.prototype.hasOwnProperty.call(builders, spec.model)) throw new RangeError('Unknown cinematic model: ' + (spec && spec.model));
      var c = context(THREE, spec);
      builders[spec.model](c);
      return c.finish();
    }
  });
})();
