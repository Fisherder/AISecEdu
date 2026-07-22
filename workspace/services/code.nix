{ pkgs }:

let
  service = import ./service.nix { inherit pkgs; };

  rgScript = pkgs.writeScript "rg" ''
    #!${pkgs.python3}/bin/python3

    import sys
    import os

    sys.argv[0] += ".orig"
    if "--follow" in sys.argv:
        sys.argv.remove("--follow")
    os.execv(sys.argv[0], sys.argv)
  '';
  code-server = pkgs.stdenv.mkDerivation {
    name = "code-server";
    src = pkgs.code-server;
    buildInputs = with pkgs; [ nodejs makeWrapper ];
    installPhase = ''
      runHook preInstall
      rgBin=libexec/code-server/lib/vscode/node_modules/@vscode/ripgrep/bin
      mkdir -p $out/$rgBin
      cp ${rgScript} $out/$rgBin/rg
      cp ${pkgs.code-server}/$rgBin/rg $out/$rgBin/rg.orig
      cp -ru ${pkgs.code-server}/libexec/code-server/. $out/libexec/code-server
      mkdir -p $out/bin
      makeWrapper ${pkgs.nodejs}/bin/node $out/bin/code-server --add-flags $out/libexec/code-server/out/node/entry.js
      runHook postInstall
    '';
  };

  cppTools = pkgs.vscode-extensions.ms-vscode.cpptools.overrideAttrs (_: {
    src = pkgs.fetchurl {
      name = "ms-vscode-cpptools.zip";
      url = "https://github.com/microsoft/vscode-cpptools/releases/download/v1.28.3/cpptools-linux-x64.vsix";
      hash = "sha256-Fnio8fB7xA7fwcP6NDSV04/NRzY1bnfPlCyMmobYOUs=";
    };
  });

  codeExtensions = pkgs.symlinkJoin {
    name = "aisecedu-code-extensions";
    paths = [
      pkgs.vscode-extensions.ms-python.python
      cppTools
    ];
  };

  userSettings = pkgs.writeText "aisecedu-code-settings.json" (builtins.toJSON {
    "security.workspace.trust.enabled" = false;
    "security.workspace.trust.startupPrompt" = "never";
    "security.workspace.trust.banner" = "never";
    "workbench.startupEditor" = "none";
  });

  launcher = pkgs.writeShellScriptBin "dojo-code" ''
    until [ -f /run/dojo/var/ready ]; do sleep 0.1; done

    if [ -d /run/challenge/share/code/extensions ]; then
      EXTENSIONS_DIR="/run/challenge/share/code/extensions"
    else
      EXTENSIONS_DIR="${codeExtensions}/share/vscode/extensions"
    fi

    USER_DATA_DIR="/run/dojo/var/code-service/user-data"
    mkdir -p "$USER_DATA_DIR/User"
    cp ${userSettings} "$USER_DATA_DIR/User/settings.json"

    ${service}/bin/dojo-service start code-service/code-server \
      ${code-server}/bin/code-server \
        --auth=none \
        --bind-addr=0.0.0.0:8080 \
        --trusted-origins='*' \
        --disable-telemetry \
        --disable-update-check \
        --disable-workspace-trust \
        --extensions-dir=$EXTENSIONS_DIR \
        --user-data-dir=$USER_DATA_DIR \
        --config=/dev/null \
        /challenge

    until ${pkgs.curl}/bin/curl -fs localhost:8080 >/dev/null; do sleep 0.1; done
  '';

in pkgs.symlinkJoin {
  name = "code-service";
  paths = [
    code-server
    launcher
  ];
  postBuild = ''
    mkdir -p $out/share/code
    ln -s ${codeExtensions}/share/vscode/extensions $out/share/code/extensions
  '';
}
