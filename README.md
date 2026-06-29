# NexBoost — Panel SMM Profesional

Panel SMM de revendedor. Compra servicios al por mayor de un proveedor JAP-compatible y los revende con margen.

## Stack
- Frontend: HTML/CSS/JS puro (sin frameworks)
- Base de datos: Firebase Firestore
- Auth: Firebase Authentication
- Hosting: GitHub Pages / Cloudflare Pages
- Proveedor: JustAnotherPanel o cualquier API JAP-compatible

## Configuración rápida

### 1. Firebase
1. Crea un proyecto en [console.firebase.google.com](https://console.firebase.google.com)
2. Activa **Authentication** (Email/Password)
3. Activa **Firestore Database**
4. Copia tus credenciales en `js/config.js`
5. Aplica las reglas de `firestore.rules` en la consola de Firestore

### 2. Primer admin
1. Regístrate normalmente en la app
2. En Firestore, busca tu documento `users/{tu-uid}` y cambia `role` a `"admin"`

### 3. Configurar proveedor API
1. Entra al panel admin → Configuración
2. Ingresa la URL y API key de tu proveedor (ej: JustAnotherPanel)
3. Configura el markup (ej: `1.5` = 50% de ganancia)
4. Sincroniza los servicios desde el panel admin → Servicios

### 4. Métodos de pago
En admin → Configuración → Métodos de pago, configura tus datos de Binance/Zelle/USDT.

## Proveedores recomendados (más económicos que fansfull.com)

| Proveedor | URL API | Precio aprox/1k seguidores IG |
|-----------|---------|-------------------------------|
| JustAnotherPanel | justanotherpanel.com | $0.30–0.60 |
| SMMFox | smmfox.com | $0.25–0.50 |
| Peakerr | peakerr.com | $0.20–0.45 |
| BoostSMM | boostsmm.com | $0.35–0.70 |

> Todos son compatibles con la misma API (formato JAP estándar).

## Estructura
```
/
├── index.html        # Landing page
├── login.html        # Login
├── register.html     # Registro
├── dashboard.html    # Panel de usuario
├── admin.html        # Panel administrador
├── api-docs.html     # Documentación API pública
├── css/style.css     # Estilos globales
├── js/
│   ├── config.js     # Firebase config + constantes
│   ├── app.js        # Utilidades compartidas
│   └── api.js        # Wrapper API proveedor + Firestore
└── firestore.rules   # Reglas de seguridad Firestore
```
