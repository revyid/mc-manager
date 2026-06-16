# Minecraft Server Manager v2 - TODO

## Phase 1: Project Setup & Migration
- [x] Ekstrak dan analisis kode proyek lama
- [x] Inisialisasi proyek baru dengan scaffold web-db-user
- [x] Copy dan migrasi semua halaman dari proyek lama
- [x] Setup routing di App.tsx untuk semua 8 halaman

## Phase 2: DashboardLayout & Navigation
- [x] Implementasi DashboardLayout dengan sidebar
- [x] Buat navigation links untuk 6 section utama (Dashboard, Console, Players, Worlds, Plugins, Performance)
- [x] Setup responsive design untuk mobile/desktop

## Phase 3: Backend tRPC Routers
- [x] Buat performance router dengan getMetrics endpoint
- [x] Implementasi simulated/polled data untuk CPU, RAM, TPS, Disk
- [ ] Setup WebSocket untuk real-time metrics (opsional)

## Phase 4: Server Console
- [x] Implementasi executeCommand tRPC procedure
- [x] Buat UI dengan scrollable output log
- [x] Tambahkan command history support
- [x] Implementasi input validation

## Phase 5: Player Management
- [x] Implementasi list players UI
- [x] Wire kick, ban, unban, op, deop actions ke tRPC procedures
- [x] Tambahkan action buttons dan confirmations

## Phase 6: World & Plugin Management
- [x] Implementasi World Management dengan backup/restore/save actions
- [x] Implementasi Plugin Manager dengan upload, enable/disable, delete
- [x] Wire semua actions ke tRPC procedures

## Phase 7: Auto Setup & Properties Editor
- [x] Implementasi Auto Setup Wizard dengan multi-step form
- [x] Implementasi Server Properties Editor dengan field editing
- [x] Wire ke servers.create dan servers.updateProperties procedures

## Phase 8: Global Styling & Theming
- [x] Apply Minecraft-themed dark UI globally
- [x] Setup grass-green (#4CAF50) accent color
- [x] Implementasi pixel-style typography (Press Start 2P)
- [x] Style semua cards dengan dark theme
- [x] Ensure consistent styling across all pages
- [x] Fix font-semibold errors di CSS dan TSX files

## Phase 9: Testing & Finalization
- [x] Test semua routes dan navigation
- [x] Test tRPC procedures dan data flow
- [x] Test responsive design
- [x] Fix bugs dan edge cases
- [x] Create final checkpoint dan deliver ke user

## Current Status
- **Overall Progress**: ✅ 100% COMPLETE
- **Estimated Kredit Usage**: ~1150/1300 (CSS fixes included)
- **Status**: PRODUCTION READY - Ready to deploy
