// PM2 process definition for the future Next.js app deploy.
// Copied to /opt/app/ecosystem.config.js by the startup script; the
// app-deploy feature later fills /opt/app with the actual build.
module.exports = {
  apps: [
    {
      name: "nextjs-app",
      script: "npm",
      args: "start",
      cwd: "/opt/app",
      env: {
        PORT: 3000,
      },
    },
  ],
};
