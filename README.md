<!-- BEGIN_STORE_STYLE_README -->
<h1 align="center">
  <br />
  <img src="https://raw.githubusercontent.com/CyberArcenal/Tillify/main/public/logo.png" width="70" style="border-radius: 20px;" />
  <br />
  Tillify POS
  <br />
  <img src="https://img.shields.io/badge/version-1.0.11-blue" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-green" />
</h1>

<p align="center">
  <strong>All‑in‑one Point of Sale system for groceries, restaurants, retail stores, and service businesses</strong><br />
  ✨ Offline‑first • Touchscreen friendly • Free & open source ✨
</p>

<p align="center">
  <a href="#-download"><img src="https://img.shields.io/badge/⬇️%20Download%20for-Windows-0078D6?style=for-the-badge&logo=windows"></a>
  <a href="#-download"><img src="https://img.shields.io/badge/⬇️%20Download%20for-macOS-000000?style=for-the-badge&logo=apple"></a>
  <a href="#-download"><img src="https://img.shields.io/badge/⬇️%20Download%20for-Linux-FCC624?style=for-the-badge&logo=linux"></a>
</p>

<p align="center">
  <img src="https://github.com/CyberArcenal/Tillify/blob/main/screenshots/thumbnail1.png?raw=true" width="45%" />
  <img src="https://github.com/CyberArcenal/Tillify/blob/main/screenshots/thumbnail2.png?raw=true" width="45%" />
</p>

---

## 🎯 Who is Tillify for?

<table align="center">
  <tr>
    <td align="center" width="33%">🛒 <b>Grocery / Corner store</b><br />Fast inventory, vouchers, barcode ready</td>
    <td align="center" width="33%">🍽️ <b>Restaurant / Cafe</b><br />Loyalty points, touchscreen even with wet hands</td>
    <td align="center" width="33%">🔥 <b>Gas / Hardware / Services</b><br />Works without a scanner, offline first, multi‑branch sync</td>
  </tr>
</table>

---

## ✨ Features that speed up your business

<div align="center">
  <table>
    <tr>
      <td align="center" width="33%">🖥️ <b>Touchscreen POS</b><br />Grid layout + instant search, works with mouse or finger</td>
      <td align="center" width="33%">📦 <b>Real‑time inventory sync</b><br />Stock updates across multiple branches, with retry logic</td>
      <td align="center" width="33%">❤️ <b>Loyalty program</b><br />Points earning & redemption, customer history</td>
    </tr>
    <tr>
      <td align="center">📊 <b>Sales analytics</b><br />Interactive charts, sales reports, customer insights</td>
      <td align="center">💾 <b>Offline‑first</b><br />Works without internet – syncs when back online</td>
      <td align="center">🔄 <b>Auto backup & audit trail</b><br />Your data never gets lost, every action is logged</td>
    </tr>
    <tr>
      <td align="center">🧾 <b>Receipt generation</b><br />Print or save as PDF</td>
      <td align="center">🔌 <b>External DB sync</b><br />Connect to another database for inventory</td>
      <td align="center">⚙️ <b>Auto‑update</b><br />Via GitHub releases – always the latest version</td>
    </tr>
  </table>
</div>

---

## 🚀 Start in under 5 minutes – no coding required

1. **Download** the installer for your OS (Windows, macOS, Linux)
2. **Install** and open Tillify
3. **Add a product** to your inventory
4. **Start selling** – just tap on the touchscreen or scan a barcode

> 💡 You don't need any coding knowledge. If you want to customize or contribute, the technical guide is below.

---

## 🛠️ For developers (technical details)

<details>
<summary><b>📁 Expand to see the stack, installation, and scripts</b></summary>

### Tech stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Chart.js
- **Desktop**: Electron, Node.js
- **Database**: SQLite + TypeORM, Decimal.js for accurate money math
- **Build tools**: electron-builder, GitHub Actions

### Quick setup (if you want to run from source)

```bash
git clone https://github.com/CyberArcenal/Tillify.git
cd Tillify
npm install
npm run migration:run   # set up database
npm run seed            # (optional) sample data
npm run dev
```

### Useful scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite + Electron hot reload |
| `npm run build` | Production build |
| `npm run migration:generate` | Create a new migration |
| `npm run migration:run` | Apply migrations |
| `npm run seed:reset` | Reset DB + add sample data |
| `npm run lint` | Lint the code |

### Project structure (for developers)

```
Tillify/
├── src/
│   ├── main/         # Electron main process (DB, IPC, entities)
│   ├── renderer/     # React frontend (UI, routing, hooks)
│   └── migrations/   # Database migrations
├── release/          # Packaged app (NSIS, DMG, AppImage)
└── build/            # Icons and build assets
```

### Troubleshooting (common issues)

- **Database errors**: Make sure the app has write permissions. Try `npm run rebuild` for SQLite native modules.
- **Migration failed**: An automatic backup is made before each migration – restore from `userData/backups`.
- **Build errors**: Check Node.js version (18+), clear `node_modules` and `dist`.

</details>

---

## 📦 Download

| Platform | Link |
|----------|------|
| Windows (NSIS installer) | [Download `.exe`](https://github.com/CyberArcenal/Tillify/releases/latest) |
| macOS (DMG) | [Download `.dmg`](https://github.com/CyberArcenal/Tillify/releases/latest) |
| Linux (AppImage) | [Download `.AppImage`](https://github.com/CyberArcenal/Tillify/releases/latest) |

> Auto‑update is supported on all platforms via GitHub releases.

---

## 📄 License

Tillify is **dual‑licensed**:
- **Apache License 2.0** – for open source community use.
- **Commercial License** – for proprietary or enterprise use (includes dedicated support).

For commercial inquiries: [cyberarcenal1@gmail.com](mailto:cyberarcenal1@gmail.com)

---

## 💖 Support this project

If Tillify has helped your business or you as a developer, you can buy a coffee ☕

[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-blue)](https://github.com/sponsors/CyberArcenal)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.me/Lugawan677)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-red)](https://ko-fi.com/cyberarcenal60019)

**GCash / PayMaya** – Scan the QR code below:

<img src="https://github.com/CyberArcenal/Kabisilya-Management/blob/main/screenshots/gcash-qr.JPG?raw=true" width="150" />

---

## 🤝 Contribute

1. Fork the repo
2. Create a branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## 📞 Support

- [Open an issue on GitHub](https://github.com/CyberArcenal/Tillify/issues)
- [Check the `/docs` folder](./docs)
- [Discussions](https://github.com/CyberArcenal/Tillify/discussions)

---

<p align="center">
  <b>Made with ❤️ for Filipino businesses and the world</b>
</p>