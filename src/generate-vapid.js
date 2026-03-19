const webPush = require('web-push');
const fs = require('fs');
const path = require('path');

const keysPath = path.join(__dirname, '..', 'data', 'vapid-keys.json');

// Check if keys already exist
if (fs.existsSync(keysPath)) {
  console.log('⚠️  Las claves VAPID ya existen en', keysPath);
  console.log('   Si quieres regenerarlas, borra el archivo primero.');
  const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  console.log('📋 Public Key:', keys.publicKey);
  process.exit(0);
}

// Generate new keys
const vapidKeys = webPush.generateVAPIDKeys();

fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
fs.writeFileSync(keysPath, JSON.stringify(vapidKeys, null, 2));

console.log('✅ Claves VAPID generadas en', keysPath);
console.log('📋 Public Key:', vapidKeys.publicKey);
console.log('🔒 Private Key: [guardada en el archivo]');
console.log('');
console.log('La public key se inyecta automáticamente en el frontend.');
