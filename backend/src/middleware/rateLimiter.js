const rateLimit = require('express-rate-limit');

const lecturas = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Demasiadas solicitudes de lectura. Intente de nuevo en un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const escrituras = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { error: 'Demasiadas solicitudes de escritura. Intente de nuevo en un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { lecturas, escrituras };
