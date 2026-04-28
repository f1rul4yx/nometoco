# 🧴 No Me Toco

App para monitorizar hábitos compulsivos (tocarse la cara y morderse las uñas). Te notifica cada hora para que registres si te has tocado o no, y lleva un calendario con tu racha de días limpios.

## Funcionalidades

- Seguimiento de dos hábitos: cara (dermatilomanía) y uñas (onicofagia)
- Notificaciones push cada hora (8:00 - 00:00) aunque la app esté cerrada
- Calendario mensual con días verdes (éxito) y rojos (recaída)
- Racha de días consecutivos sin tocarte
- Casillas corregibles por si te equivocas
- PWA instalable en Android (se abre como app nativa)
- Datos persistentes en base de datos SQLite
- Autenticación con usuario y contraseña

## Instalación

```bash
apt install docker.io -y
git clone https://github.com/f1rul4yx/nometoco.git
cd nometoco
```

Genera un secreto JWT:

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
```

Arranca (usa la imagen publicada en Docker Hub):

```bash
docker compose up -d
docker compose logs -f
```

La app estará en `http://<IP>:3000`. Regístrate desde la pantalla de inicio.

## Construir imagen propia

Si quieres modificar el código y generar tu propia imagen:

```bash
cd build/
docker build -t f1rul4yx/nometoco:latest .
cd ..
docker compose up -d
```

## Uso en el móvil

1. Abre la URL en Chrome
2. Regístrate
3. Acepta las notificaciones (banner amarillo)
4. Menú ⋮ → "Añadir a pantalla de inicio"

## Comandos útiles

```bash
docker compose logs -f        # Ver logs
docker compose restart        # Reiniciar
docker compose down           # Parar
docker compose up -d          # Arrancar

# Rebuild tras cambios en el código
cd build/ && docker build -t f1rul4yx/nometoco:latest . && cd ..
docker compose up -d

# Backup de la base de datos
cp data/nometoco.db ./backup-$(date +%Y%m%d).db
```

## Stack

Node.js, Express, SQLite, Web Push, Service Worker
