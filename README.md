# cfout
[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/package/nodejs.yml?style=flat-square)](https://github.com/substrate-system/package/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/icons?style=flat-square)](README.md)
[![module](https://img.shields.io/badge/module-ESM%2FCJS-blue?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](./CHANGELOG.md)
[![install size](https://flat.badgen.net/packagephobia/install/@nichoth/session-cookie)](https://packagephobia.com/result?p=@nichoth/session-cookie)
[![gzip size](https://flat.badgen.net/bundlephobia/minzip/@substrate-system/routes)](https://bundlephobia.com/package/@substrate-system/routes)
[![dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg?style=flat-square)](package.json)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)

Run tests in Cloudflare runtime.

<details><summary><h2>Contents</h2></summary>
<!-- toc -->
</details>

## Example

```sh
cat ./test/index.ts | npx esbuild --bundle | npx cfout
```
