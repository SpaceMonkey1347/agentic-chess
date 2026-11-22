import * as esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';

const isProd = process.env.NODE_ENV === "PRODUCTION";
const watchFlag = process.argv.includes('--watch')

const ctx = await esbuild.context({
    entryPoints: ['src/client/main.ts', 'src/client/styles/main.scss'],
    bundle: true,
    minify: isProd ? true: false,
    sourcemap: isProd ? false : true,
    outdir: 'dist',
    entryNames: '[name]',
    // served from src/public by express; don't inline/copy into dist
    external: ['/assets/*.svg'],
    plugins: [ sassPlugin() ],
});

if (watchFlag) {
    await ctx.watch();
    console.log("esbuild: watching for changes...")
} else {
    await ctx.rebuild();
    await ctx.dispose();
}
