# Our Lady of Lourdes College Elections

## GitHub Pages deployment

This Vite React app must be published through the included GitHub Actions workflow.

1. Push the changes to GitHub:

	```powershell
	git add .
	git commit -m "Fix GitHub Pages deployment"
	git push origin main
	```

2. Open **Settings > Pages** in the repository.
3. Set **Source** to **GitHub Actions**.
4. Wait for **Deploy to GitHub Pages** to finish in the **Actions** tab.

Do not use **Deploy from a branch** with the repository root. The root `index.html` is Vite source HTML; the workflow publishes the production-ready `dist` folder.

For PowerShell development, use `npm.cmd run dev` if `npm` is blocked by execution policy.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
