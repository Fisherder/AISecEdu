{
  description = "AISecEdu Workspace Flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    nixpkgs-24-11.url = "github:NixOS/nixpkgs/nixos-24.11";
    nixpkgs-pr-angr-management.url = "github:NixOS/nixpkgs/pull/360310/head";
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-24-11,
      nixpkgs-pr-angr-management,
    }:
    {
      packages = {
        x86_64-linux =
          let
            system = "x86_64-linux";
            config = {
              allowUnfree = true;
              allowBroken = true; # angr is currently marked "broken" in nixpkgs, but works fine (without unicorn)
            };

            angr-management-overlay = self: super: {
              angr-management = (import nixpkgs-pr-angr-management { inherit system config; }).angr-management;
            };

            ida-free-overlay = final: prev:
              let
                legacyIda = (import nixpkgs-24-11 { inherit system config; }).ida-free.override {
                  fetchurl = args:
                    if (args.hash or "") == "sha256-widkv2VGh+eOauUK/6Sz/e2auCNFAsc8n9z0fdrSnW0=" then
                      final.writeText "ida-free-bootstrap-icon.svg" ''
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
                          <rect width="64" height="64" rx="12" fill="#111827"/>
                          <path d="M7 42 19 14h8L15 42zm17 0V14h12c12 0 20 5 20 14s-8 14-20 14zm9-7h4c7 0 11-2 11-7s-4-7-11-7h-4z" fill="#58c4dc"/>
                        </svg>
                      ''
                    else
                      final.fetchurl args;
                };
                desktopItem = final.makeDesktopItem {
                  name = "ida-free";
                  exec = "ida64";
                  icon = "ida-free";
                  comment = "Freeware interactive disassembler";
                  desktopName = "IDA Free";
                  genericName = "Interactive Disassembler";
                  categories = [ "Development" ];
                  startupWMClass = "IDA";
                };
              in
              {
                ida-free = legacyIda.overrideAttrs (oldAttrs: {
                  src = final.fetchurl {
                    url = "https://out7.hex-rays.com/files/idafree84_linux.run";
                    hash = "sha256-lB8ijOSJvwoUJomA7a0WFAvil+B0kkXXg5oqOwIHCmI=";
                  };
                  postInstall = (oldAttrs.postInstall or "") + ''
                    install -Dm644 "$out/opt/appico64.png" "$out/share/icons/hicolor/64x64/apps/ida-free.png"
                  '';
                  inherit desktopItem;
                  desktopItems = [ desktopItem ];
                });
              };

            sage-overlay = final: prev: {
              sage = prev.sage.override {
                extraPythonPackages = ps: with ps; [
                  pycryptodome
                  pwntools
                ];
              requireSageTests = false;
              };
            };

            pkgs = import nixpkgs {
              inherit system config;
              overlays = [
                angr-management-overlay
                ida-free-overlay
                sage-overlay
              ];
            };

            ldd = pkgs.writeShellScriptBin "ldd" ''
              ldd=/usr/bin/ldd
              for arg in "$@"; do
                case "$arg" in
                  -*) ;;
                  *)
                    case "$(readlink -f "$arg")" in
                      /nix/store/*) ldd="${pkgs.lib.getBin pkgs.glibc}/bin/ldd" ;;
                    esac
                    ;;
                esac
              done
              exec "$ldd" "$@"
            '';

            exec-suid = import ./core/exec-suid.nix { inherit pkgs; };
            init = import ./core/init.nix { inherit pkgs; };
            ssh-entrypoint = import ./core/ssh-entrypoint.nix { inherit pkgs; };
            sudo = import ./core/sudo.nix { inherit pkgs; };
            dojo-cli = import ./core/dojo-cli.nix { inherit pkgs; };

            service = import ./services/service.nix { inherit pkgs; };
            code-service = import ./services/code.nix { inherit pkgs; };
            desktop-service = import ./services/desktop.nix { inherit pkgs; };
            terminal-service = import ./services/terminal.nix { inherit pkgs; };

            additional = import ./additional/additional.nix { inherit pkgs; };

            corePackages = with pkgs; [
              bashInteractive
              cacert
              coreutils
              curl
              findutils
              gawk
              glibc
              glibc.static
              glibcLocales
              gnugrep
              gnused
              hostname
              iproute2
              less
              man
              ncurses
              nettools
              procps
              python3
              util-linux
              wget
              which

              (lib.hiPrio ldd)

              exec-suid
              init
              ssh-entrypoint
              sudo

              service
              code-service
              desktop-service
              terminal-service
              dojo-cli
            ];

            fullPackages = corePackages ++ additional.packages;

            buildDojoEnv =
              name: paths:
              let
                suidPaths = pkgs.lib.unique (
                  builtins.concatLists (
                    map (
                      pkg:
                      if builtins.isAttrs pkg && pkg ? out && pkg.meta ? suid then
                        map (rel: "${pkg.out}/${rel}") pkg.meta.suid
                      else
                        [ ]
                    ) paths
                  )
                );
                suidFile = pkgs.writeTextDir "suid" (pkgs.lib.concatMapStrings (s: s + "\n") suidPaths);
              in
              pkgs.buildEnv {
                name = "dojo-workspace-${name}";
                paths = paths ++ [ suidFile ];
              };

          in
          {
            default = buildDojoEnv "core" corePackages;
            core = buildDojoEnv "core" corePackages;
            full = buildDojoEnv "full" fullPackages;
          };
      };

      defaultPackage.x86_64-linux = self.packages.x86_64-linux;
    };
}
