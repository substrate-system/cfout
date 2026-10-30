import {
    newneostandard,
    plugins,
    resolveIgnoresFromGitignore,
} from 'newneostandard'

export default [
    ...newneostandard({
        ts: true,
        ignores: resolveIgnoresFromGitignore(),
    }),
    { ignores: ['dist/**'] },
    {
        plugins: { '@stylistic': plugins['@stylistic'] },
        rules: {
            '@stylistic/indent': ['error', 4],
            // type annotations are written with no space: `name:string`
            '@stylistic/key-spacing': 'off',
            '@stylistic/type-annotation-spacing': ['error', {
                before: false,
                after: false,
                // arrows in function types are left to arrow-spacing
                overrides: { arrow: 'ignore' },
            }],
            '@stylistic/space-infix-ops': ['error', { ignoreTypes: true }],
        },
    },
]
