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
      rm -rf $out/libexec/code-server/lib/vscode/extensions/git $out/libexec/code-server/lib/vscode/extensions/git-base $out/libexec/code-server/lib/vscode/extensions/github $out/libexec/code-server/lib/vscode/extensions/github-authentication
      cp ${./remote-console-frame.js} $out/libexec/code-server/lib/vscode/out/xuanjia-console.js
      substituteInPlace $out/libexec/code-server/lib/vscode/out/vs/code/browser/workbench/workbench.html \
        --replace-fail '<script src="{{WORKBENCH_WEB_BASE_URL}}/out/vs/loader.js"></script>' '<script>window.XuanjiaConsoleKind="code";window.XuanjiaConsoleParentOrigin=${builtins.toJSON (builtins.fromJSON (builtins.readFile ./console-origin.json)).publicOrigin};</script><script src="{{WORKBENCH_WEB_BASE_URL}}/out/xuanjia-console.js"></script><script src="{{WORKBENCH_WEB_BASE_URL}}/out/vs/loader.js"></script>'
      mkdir -p $out/bin
      makeWrapper ${pkgs.nodejs}/bin/node $out/bin/code-server --add-flags $out/libexec/code-server/out/node/entry.js
      runHook postInstall
    '';
  };

  extensionManifest = builtins.fromJSON (builtins.readFile ./code-extensions.json);

  buildExtension = extension: pkgs.vscode-utils.buildVscodeExtension {
    pname = "${extension.publisher}-${extension.name}";
    inherit (extension) version;
    vscodeExtPublisher = extension.publisher;
    vscodeExtName = extension.name;
    vscodeExtUniqueId = pkgs.lib.toLower "${extension.publisher}.${extension.name}";
    src = pkgs.fetchurl {
      name = "${extension.publisher}.${extension.name}-${extension.version}.zip";
      inherit (extension) url hash;
    };
    nativeBuildInputs = pkgs.lib.optionals (extension.name == "vscode-lldb") [ pkgs.autoPatchelfHook ];
    buildInputs = pkgs.lib.optionals (extension.name == "vscode-lldb") [
      pkgs.stdenv.cc.cc.lib
      pkgs.zlib
      pkgs.libxml2
      pkgs.libedit
      pkgs.ncurses
      pkgs.xz
    ];
  };

  readerExtension = pkgs.runCommand "xuanjia-assignment-reader" {} ''
    mkdir -p $out/share/vscode/extensions/xuanjia.assignment-reader
    cp ${./assignment-reader/package.json} ${./assignment-reader/extension.js} $out/share/vscode/extensions/xuanjia.assignment-reader/
  '';

  codeExtensions = pkgs.symlinkJoin {
    name = "aisecedu-code-extensions";
    paths = (map buildExtension extensionManifest) ++ [ readerExtension ];
  };

  userSettings = pkgs.writeText "aisecedu-code-settings.json" (builtins.toJSON {
    "security.workspace.trust.enabled" = false;
    "security.workspace.trust.startupPrompt" = "never";
    "security.workspace.trust.banner" = "never";
    "workbench.startupEditor" = "none";
    "extensions.autoUpdate" = false;
    "git.enabled" = false;
    "git.autofetch" = false;
    "git.decorations.enabled" = false;
    "github.gitAuthentication" = false;
    "markdown-preview-enhanced.enableScriptExecution" = false;
    "markdown-preview-enhanced.enablePreviewScripts" = false;
    "clangd.path" = "${pkgs.clang-tools}/bin/clangd";
    "clangd.checkUpdates" = false;
    "lldb.launch.initCommands" = [ "settings set target.disable-aslr false" ];
    "python.languageServer" = "None";
    "python.experiments.enabled" = false;
    "python.locator" = "js";
    "python.defaultInterpreterPath" = "/run/dojo/bin/python3";
    "basedpyright.importStrategy" = "useBundled";
    "[python]" = { "editor.defaultFormatter" = "charliermarsh.ruff"; };
    "[javascript]" = { "editor.defaultFormatter" = "esbenp.prettier-vscode"; };
    "[typescript]" = { "editor.defaultFormatter" = "esbenp.prettier-vscode"; };
    "[json]" = { "editor.defaultFormatter" = "esbenp.prettier-vscode"; };
    "[markdown]" = { "editor.defaultFormatter" = "esbenp.prettier-vscode"; };
  });

  launcher = pkgs.writeShellScriptBin "dojo-code" ''
    until [ -f /run/dojo/var/ready ]; do sleep 0.1; done

    STATE_ROOT="/home/hacker/.local/share/code-server"
    ${pkgs.python3}/bin/python3 ${./code-extensions.py} \
      --state-root "$STATE_ROOT" \
      --defaults ${userSettings} \
      --legacy /run/dojo/var/code-service/user-data \
      ${codeExtensions}/share/vscode/extensions \
      /run/challenge/share/code/extensions

    EXTENSIONS_DIR="$STATE_ROOT/extensions"
    USER_DATA_DIR="$STATE_ROOT/user-data"

    ${service}/bin/dojo-service start code-service/code-server \
      ${code-server}/bin/code-server \
        --auth=none \
        --bind-addr=0.0.0.0:8080 \
        --trusted-origins='*' \
        --disable-telemetry \
        --disable-update-check \
        --disable-workspace-trust \
        --extensions-dir="$EXTENSIONS_DIR" \
        --user-data-dir="$USER_DATA_DIR" \
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
