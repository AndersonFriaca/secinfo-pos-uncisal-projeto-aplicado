// PM2 process definition for the Next.js app deploy.
// Copied verbatim to /opt/app/ecosystem.config.js by the startup script
// (infra/scripts/startup.sh.tpl, stage 10) — the two copies MUST stay identical.
// PM2 runs this as the dedicated locked `appsvc` user (not the operator), via
// the pm2-appsvc systemd unit the startup script registers in stage 9.
//
// The CI/CD pipeline unpacks each `next build` standalone bundle into
// /opt/app/releases/<sha> and flips /opt/app/current -> that release. PM2
// runs `node current/server.js` from /opt/app, loading runtime secrets from
// /opt/app/.env.production (written by the pipeline with chmod 600).
module.exports = {
  apps: [
    {
      name: "nextjs-app",
      script: "current/server.js",
      cwd: "/opt/app",
      node_args: "--env-file=/opt/app/.env.production",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
