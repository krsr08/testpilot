import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['**/.next/**','node_modules/**','**/next-env.d.ts']},js.configs.recommended,...tseslint.configs.recommended,{rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]},languageOptions:{globals:{process:'readonly',console:'readonly',Buffer:'readonly',setInterval:'readonly',setTimeout:'readonly',fetch:'readonly',URL:'readonly',Request:'readonly',Response:'readonly',FormData:'readonly'}}});
