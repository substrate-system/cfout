import { newneostandard, resolveIgnoresFromGitignore } from 'newneostandard'

export default [
    ...newneostandard({
        ts: true,
        ignores: [...resolveIgnoresFromGitignore(), 'dist/**'],
    }),
    {
        rules: {
            '@stylistic/indent': ['error', 4],
            // type annotations are written with no space: `name:string`
            '@stylistic/key-spacing': 'off',
            '@stylistic/type-annotation-spacing': ['error', {
                before: false,
                after: false,
                overrides: { arrow: { before: true, after: true } },
            }],
            '@stylistic/space-infix-ops': ['error', { ignoreTypes: true }],
        },
    },
]
