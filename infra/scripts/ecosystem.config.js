// PM2 process definition for the Next.js app deploy.
// This file is the single source of truth: infra/compute.tf reads it with
// file() and Terraform injects its content verbatim into the startup script
// (infra/scripts/startup.sh.tpl, stage 10), which writes it to
// /opt/app/ecosystem.config.js on the VM.
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
