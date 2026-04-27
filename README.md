# Tillify (POS Management System)

A modern, feature‑rich Point of Sale (POS) management system built with **Electron, React, TypeScript, and SQLite**. This desktop application provides tools for retail operations, inventory tracking, sales processing, and customer relationship management.

## Why Tillify?

Tillify is an **all-in-one POS system** designed for any business type:

- 🛒 Grocery and retail shops  
- 🍽 Restaurants and cafés  
- 🔥 Gasul and supply stores  
- 🛠 Service-based businesses  

With **offline-first design**, **customer loyalty**, **vouchers**, and **auto-update support**, Tillify adapts to your workflow — no matter the industry.

### Touchscreen-Friendly Cashier

- Large **grid-based item layout** for quick tap selection  
- Built-in **search bar** for fast lookup of products  
- Optimized for **Windows touchscreen devices** (Surface, 2-in-1 laptops, tablets)  
- Works seamlessly with **mouse + keyboard** or **touch input**  
- Designed to be **hardware-optional** — fully functional even without barcode scanners or receipt printers

## 📸 Gallery

![Thumbnail 1](https://github.com/CyberArcenal/Tillify/blob/main/screenshots/thumbnail1.png?raw=true)
![Thumbnail 2](https://github.com/CyberArcenal/Tillify/blob/main/screenshots/thumbnail2.png?raw=true)
![Thumbnail 3](https://github.com/CyberArcenal/Tillify/blob/main/screenshots/thumbnail3.png?raw=true)
![Thumbnail 4](https://github.com/CyberArcenal/Tillify/blob/main/screenshots/thumbnail4.png?raw=true)

## 🚀 Features

### Core

- **Sales Processing**: Full POS workflow with receipt generation
- **Inventory Management**: Track stock levels, manage products, monitor movements
- **Customer Management**: Profiles, contact info, transaction history
- **Loyalty Program**: Points earning and redemption
- **Cross‑platform**: Windows, macOS, Linux

### Advanced

- **Database Sync**: Real‑time inventory synchronization
- **Audit Trail**: Comprehensive activity logging
- **Automated Backups**: Backup and recovery system
- **Migrations**: Automated schema management
- **Reporting & Analytics**: Sales, inventory, customer insights, charts

## 🛠 Tech Stack

**Frontend**

- React 19, TypeScript, Vite, Tailwind CSS
- Chart.js (analytics), React Router (navigation)

**Backend**

- Electron (desktop framework)
- Node.js runtime
- TypeORM ORM + SQLite3 database

**Key Libraries**

- Decimal.js (precise financial calculations)
- Lucide React (icons)
- Reflect Metadata (TypeORM support)

## 📁 Project Structure

```
Tillify/
├── src/
│   ├── main/           # Electron main process
│   │   ├── db/         # Database config
│   │   ├── entities/   # TypeORM models
│   │   ├── ipc/        # IPC handlers
│   │   └── services/   # Business logic
│   ├── renderer/       # React frontend
│   └── migrations/     # Database migrations
├── build/              # Build assets/icons
├── dist/               # Production build
├── release/            # Packaged app
└── assets/             # Static assets
```

## 🔧 Installation

**Prerequisites**: Node.js 18+, npm, Git

1. Clone repo
   ```bash
   git clone https://github.com/CyberArcenal/Tillify.git
   cd Tillify
   ```
2. Install dependencies
   ```bash
   npm install
   ```
3. Run migrations
   ```bash
   npm run migration:run
   ```
4. (Optional) Seed data
   ```bash
   npm run seed
   ```

## 🚦 Development

Scripts:

- `npm run dev` → Vite + Electron hot reload
- `npm run build` → Production build
- `npm run migration:generate` → New migration
- `npm run migration:run` → Apply migrations
- `npm run migration:revert` → Rollback
- `npm run seed:reset` → Reset DB
- `npm run lint` → Lint code
- `npm run preview` → Preview build

## 📦 Production Build

```bash
npm run build
```

Outputs packaged app in `release/`.

- Windows: NSIS installer
- macOS: DMG
- Linux: AppImage
- Auto‑update via GitHub releases

## 🗄️ Database

- SQLite stored in user data directory
- Automatic backups before migrations
- Recovery system included

**Entities**: Users, Products, Inventory, Sales, Customers, Loyalty, Audit Trail, Settings

## 🔌 Inventory Sync

- Connects to external DBs
- Real‑time stock sync
- Retry logic + configurable intervals

## 🔒 Security

- Audit logging
- SQLite encryption options
- Input validation
- Secure IPC

## 📊 Reporting

- Sales, inventory, customer, financial reports
- Interactive charts via Chart.js

## 🛠 Troubleshooting

- **DB errors**: check permissions, rebuild SQLite modules
- **Migration failures**: restore backup, check migration files
- **Build errors**: verify dependencies, Node.js version, TS compilation

Logs: console (dev), user data directory (prod), IPC logging

## 🤝 Contributing

1. Fork repo
2. Create branch (`git checkout -b feature/XYZ`)
3. Commit (`git commit -m 'Add XYZ'`)
4. Push (`git push origin feature/XYZ`)
5. Open PR

## 📄 License

Proprietary © CyberArcenal. See repo for details.

## 📞 Support

- GitHub issues
- `/docs` folder
- Troubleshooting section

## 📜 Changelog

All notable changes are documented in the [CHANGELOG.md](./CHANGELOG.md).

---

## 💖 Support This Project

If you find this project helpful, consider supporting its development:

[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-blue)](https://github.com/sponsors/CyberArcenal)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.me/Lugawan677)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-red)](https://ko-fi.com/cyberarcenal60019)

## 📱 Donate via GCash

Scan the QR code below to send your support:

![GCash QR](https://github.com/CyberArcenal/Kabisilya-Management/blob/main/screenshots/gcash-qr.JPG?raw=true)
