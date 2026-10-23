FROM aisecedu/agent-runtime:authoring-projects-20260912-v2
USER root
COPY --chown=nextjs:nodejs validator-v3-good /app/runtime-deps
RUN ln -sfn /app/runtime-deps/node_modules/eslint /app/node_modules/eslint && node -e "const {Linter}=require('eslint'); if(new Linter().verify('missingFunction();',{rules:{'no-undef':'error'}}).length!==1) process.exit(1)"
USER nextjs
