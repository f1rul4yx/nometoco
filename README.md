# nometoco

App para monitorizar y reducir hábitos compulsivos.

## Qué es

PWA instalable en Android que registra si te has tocado la cara o las uñas cada hora. Lleva un calendario mensual con días de éxito y recaída, muestra la racha de días consecutivos limpios y envía notificaciones push aunque la app esté cerrada.

## Instalación

```bash
git clone https://github.com/f1rul4yx/nometoco.git
cd nometoco
```

Genera el secreto JWT:

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
```

## Uso

```bash
docker compose up -d
```

Accede a `http://<IP>:3000`. Regístrate, acepta las notificaciones y añade la app a la pantalla de inicio desde Chrome (menú ⋮ → "Añadir a pantalla de inicio").

```bash
docker compose logs -f    # Ver logs
docker compose restart    # Reiniciar
docker compose down       # Parar
```

## Build

```bash
cd build/
docker build -t f1rul4yx/nometoco:latest .
cd ..
docker compose up -d
```
