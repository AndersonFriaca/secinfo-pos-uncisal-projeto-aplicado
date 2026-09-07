App Next.js 16 (App Router, SSR) do projeto. Auth server-side via Firebase /
Identity Platform; rate limiting em memória.

## Rodar localmente

Pré-requisitos: Node 24, `gcloud` autenticado, `infra/` já aplicado (a API key
existe no state).

```bash
cd web
npm ci

# 1. env local (gitignored)
cp .env.local.example .env.local
# preencha IDENTITY_PLATFORM_API_KEY:
terraform -chdir=../infra output -raw identity_platform_api_key
# e GOOGLE_CLOUD_PROJECT = project_id do infra/terraform.tfvars

# 2. Application Default Credentials para o firebase-admin (mint/verify do cookie)
gcloud auth application-default login
gcloud auth application-default set-quota-project <project-id>

# 3. subir
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Fluxo de validação:
cadastro → e-mail de verificação (Identity Platform envia) → login → `/dashboard`
→ logout. Sem a API key, `/api/auth/*` responde 503; sem ADC, o login falha ao
criar o cookie de sessão.

`npm test` / `npm run lint` / `npm run typecheck` / `npm run build` rodam sem
credencial nenhuma.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
