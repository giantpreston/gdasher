# GDasher

GDasher is a small Node.js utility that allows Geometry Dash users to make changes to their own Geometry Dash accounts via a small and lightweight CLI menu tool.

GDasher doesn't make use of any external libraries apart from those provided directly by Node.js, ensuring the project remains lightweight.

**Features**
- **Network helpers:** reusable request logic and connection helpers.
- **Authentication:** pluggable auth helpers for scripts and services.
- **Utilities:** common helpers to simplify small automation tasks.

**Requirements**
- **Node.js:** v14 or later

**Installation**
- Clone the repo:

```bash
git clone https://github.com/giantpreston/gdasher.git
cd GDasher
```

**Quick Start**
- Run the main entry script:

```bash
node index.js
```

**Credits:**
- Massive thank you to [gd-docs](https://github.com/Rifct/gd-docs) for having an up-to-date documentation on the Geometry Dash protocol easily and readily available at [boomlings.dev](https://boomlings.dev). It saved me a lot of time!

**Configuration**
- **Environment:** Configure runtime options via environment variables or by editing the small helper modules.
- **Files to review:** See [auth.js](auth.js) and [network.js](network.js) for authentication and networking setup.

**Development**
- **Run locally:** Edit source files and re-run `node index.js`.
- **Key files:** the main entry and helpers live in [index.js](index.js), [utils.js](utils.js), and [auth.js](auth.js).

**Contributing**
- Fork the repo, make changes on a feature branch, and open a pull request.

**License**
- This project is provided under the MIT license. Read more on [the license file](LICENSE).
