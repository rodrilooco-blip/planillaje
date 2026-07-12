# Sistema de Planillaje Médico - Documentación Técnica

## 1. Arquitectura General

```
Navegador (Frontend JS vanilla)
       ↕ HTTP (JSON) - Fetch API
Backend (Node.js + Express - Puerto 3000)
       ↕ googleapis (Sheets API v4 + Drive API v3)
Google Sheets (3 archivos en Google Drive)
       ↕ Respaldado por Cache persistente en JSON
```

## 2. Stack Tecnológico

| Componente | Tecnología | Versión |
|---|---|---|
| Lenguaje Backend | Node.js | v24.18.0 |
| Framework Web | Express | ^4.21.2 |
| Google API | googleapis | ^144.0.0 |
| Rate Limiting | express-rate-limit | ^7.5.0 |
| Autenticación Google | Service Account (credentials.json) | - |
| Frontend | JavaScript vanilla | ES6 |
| Cache | Archivos JSON en backend/cache/ | - |
| Almacenamiento | Google Sheets API v4 | - |

## 3. Estructura de Archivos

```
/Planillaje/
├── credentials.json              ← Cuenta de servicio Google (NO subir a git)
├── backend/
│   ├── package.json
│   ├── .env                      ← Variables de entorno (IDs de sheets)
│   ├── .env.example              ← Plantilla sin valores reales
│   ├── server.js                 ← Entry point, Express configurado
│   ├── cache/                    ← Cache persistente de catálogos (JSON)
│   │   ├── procedimientos.json
│   │   ├── diagnosticos.json
│   │   └── ... (se crean al primer uso)
│   └── src/
│       ├── config/
│       │   └── env.js            ← Valida y exporta variables de entorno
│       ├── middleware/
│       │   └── rateLimiter.js    ← 200 req/min lectura, 50 req/min escritura
│       ├── services/
│       │   ├── googleSheets.js   ← Conexión con Google Sheets API
│       │   ├── catalogoCache.js  ← Caché lazy + persistente en archivos
│       │   └── reglasNegocio.js  ← Reglas de validación y transformación
│       └── routes/
│           ├── catalogos.js      ← Endpoints de búsqueda en catálogos
│           └── planos.js         ← CRUD de planillas
├── frontend/
│   ├── index.html                ← SPA, sirve como página principal
│   ├── css/
│   │   ├── main.css              ← Variables, layout, botones, colores
│   │   ├── menu.css              ← Menú jerárquico colapsable
│   │   └── forms.css             ← Formularios, grid, tabla reciente, dropdown autocomplete
│   └── js/
│       ├── utils.js              ← fetchJSON, getFechaHoy, escapeHTML, getColumnKey
│       ├── api.js                ← Cliente API (GET/POST/PUT/DELETE)
│       ├── autocomplete.js       ← Trie + búsqueda local + dropdown inline
│       ├── reglas.js             ← Reglas frontend (edad, copia titular, SPPAT)
│       ├── menu.js               ← Renderizado del menú lateral
│       ├── formBuilder.js        ← Constructor de formularios con secciones
│       ├── recentTable.js        ← Tabla de últimos registros con editar/eliminar
│       └── app.js                ← Controlador principal
```

## 4. Google Sheets (Base de Datos)

### 4.1 Archivo: PLANO_EMERGENCIA
- **Sheet ID:** `1kBDtv1bhPHKQiJW6cR-heAv2Y5YlmOpq_7fJyBTSB6E`
- **Hojas:**
  - `IESS-G-EMERG` (35 columnas)
  - `IESS-C-EMERG` (35 columnas)
  - `SPPAT-EMERG` (54 columnas — incluye datos de accidente)
  - `ISSPOL-EMERG` (35 columnas + columna PORCENTAJE extra)
  - `ISSFA-EMERG` (35 columnas)

### 4.2 Archivo: PLANO_HOSPITALIZACION
- **Sheet ID:** `1gIhW51vVd_IEUM38CtyxdMg2v9PsWcDkNgiurviSGP8`
- **Hojas:**
  - `IESS-G-HOS` (35 columnas)
  - `IESS-C-HOS`
  - `SPPAT-HOS`
  - `ISSPOL-HOS`
  - `ISSFA-HOS`

### 4.3 Archivo: CATALOGOS
- **Sheet ID:** `1OlGJSpicBBp9oACtsc9WgYFBfIVuO8gi-dzrYv8M0PU`
- **Hojas:**
  - `Procedimientos` (8824 registros) — columnas: `codigo`, `descripcion`
  - `Diagnosticos` (12374 registros) — columnas: `codigo`, `descripcion`
  - `Medicamentos` (1507 registros)
  - `Beneficiario` (16 registros) — tipos de beneficiario/parentesco
  - `Dependencia` (21 registros) — códigos de dependencia
  - `TipoExamen` (14 registros)
  - `Intrahospital` (5 registros)

### 4.4 Estructura de Columnas (PLANO)

Los nombres de columna en los sheets contienen instrucciones entre paréntesis y después de ".-", ej:
```
"CODIGO DE DEPENDENCIA (Ver Instructivo)"
"NO. PACIENTE. Pegar la Formula: =SI(...)"
"MARCA FINAL.- Siempre ''F'' de FIN"
```

**Limpieza aplicada:**
1. Se trunca en `(`, `.-`, `Pegar`, `Siempre`, `/`
2. Se quita punto final
3. Se normaliza a mayúsculas con underscores (para keys)
4. Para labels: se capitaliza cada palabra con excepciones (de, del, la, los, y, en, para, por, un, una, al, con)

**Detección de secciones en el formulario:**
- `IDENTIFICACION`, `APELLIDOS`, `FECHA NACIMIENTO`, `EDAD`, `SEXO`, `PARENTESCO`, `TIPO BENEFICIARIO`, `DEPENDENCIA`, `NO. PACIENTE` → **Datos del Paciente**
- `FECHA ATENCION`, `FECHA DE INGRESO`, `FECHA DE EGRESO` → **Fechas**
- `PROCEDIMIENTO`, `CANTIDAD`, `VALOR UNITARIO`, `VALOR TOTAL`, `DURACION`, `TIEMPO`, `ANESTESIA` → **Procedimiento / Medicamento**
- `DIAGNÓSTICO`, `DG.` → **Diagnóstico**
- `EXAMEN` → **Examen**
- `AFILIADO`, `TITULAR` → **Titular / Afiliado**
- `DERIVACION`, `SECUENCIAL`, `CONTINGENCIA` → **Derivación**
- `ACCIDENTE`, `VEHÍCULO`, `PLACA`, `PROVINCIA`, `CANTÓN`, `UNICODIGO`, `EVIDENCIA` → **Datos del Accidente (SPPAT)**
- `COBERTURA`, `PRESTACION`, `DISCAPACIDAD`, `MEDICO`, `OBSERVACION` → **Cobertura**
- Otros → **Otros Datos**

## 5. Endpoints de la API

### 5.1 Catálogos
| Método | Ruta | Descripción | Rate Limit |
|---|---|---|---|
| GET | `/api/catalogos/:nombre/completo` | Retorna TODO el catálogo (usado para búsqueda local) | 200/min |
| GET | `/api/catalogos/:nombre?q=texto&limite=5` | Busca por código o descripción en catálogo | 200/min |

**Catálogos disponibles:** `procedimientos`, `diagnosticos`, `medicamentos`, `beneficiario`, `dependencia`, `tipoexamen`, `intrahospital`

### 5.2 Planos (CRUD)
| Método | Ruta | Descripción | Rate Limit |
|---|---|---|---|
| GET | `/api/planos/:tipo/:hoja` | Lista todos los registros (invertidos, último primero) | 200/min |
| GET | `/api/planos/:tipo/:hoja/columnas` | Retorna las columnas de la hoja | 200/min |
| GET | `/api/planos/:tipo/:hoja/next-numero` | Siguiente número de paciente autoincremental | 200/min |
| GET | `/api/planos/:tipo/:hoja/:fila` | Obtiene un registro específico por número de fila | 200/min |
| POST | `/api/planos/:tipo/:hoja` | Crea un nuevo registro | 50/min |
| PUT | `/api/planos/:tipo/:hoja/:fila` | Actualiza un registro existente | 50/min |
| DELETE | `/api/planos/:tipo/:hoja/:fila` | Elimina un registro (borra la fila del sheet) | 50/min |

**Parámetros:** `:tipo` = `emergencia` | `hospitalizacion`, `:hoja` = nombre exacto del sheet

### 5.3 Sistema
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Health check + última actualización de catálogo |
| GET | `/api/hojas` | Lista de hojas disponibles por módulo |

## 6. Reglas de Negocio

### 6.1 Backend (`reglasNegocio.js`)

Todas las reglas usan **búsqueda por keyword** (includes) en las keys del objeto, porque los nombres de columna varían entre hojas:

- **MARCA_FINAL = 'F'** — Busca key que contenga "MARCA_FINAL" o "MARCA"
- **UNIDAD_OPERATIVA = 'HOSPITAL MIGUEL LEON BERMEO CHUNCHI'** — Busca key que contenga "UNIDAD_OPERATIVA" o "UNIDAD"
- **SPPAT:** DEPENDENCIA = "9999999998", TIPO_BENEFICIARIO = "VA"
- **Parentesco T/TITULAR:** copia IDENTIFICACION_BENEFICIARIO → IDENTIFICACION_AFILIADO, APELLIDOS → APELLIDOS_TITULAR
- **EDAD:** calculada automáticamente desde FECHA_NACIMIENTO y FECHA_INGRESO/FECHA_ATENCION
- **Validación:** Requiere IDENTIFICACION_BENEFICIARIO, APELLIDOS, FECHA_INGRESO
- **NO. PACIENTE:** autoincremental si el campo está vacío

### 6.2 Frontend (`reglas.js`)

Refleja las mismas reglas en tiempo real:
- Escucha cambios en FECHA_NACIMIENTO, FECHA_INGRESO, FECHA_ATENCION para recalcular EDAD
- Escucha cambios en PARENTESCO para copiar datos del titular
- Aplica valores fijos en el DOM (disabled) al cargar el formulario

## 7. Estrategia de Caché

### 7.1 Cache Persistente (Archivos JSON)
- **Ubicación:** `backend/cache/{nombre}.json`
- **Flujo:**
  1. Al solicitar un catálogo, primero busca en `backend/cache/{nombre}.json`
  2. Si existe y tiene datos, lo carga directamente (sin llamar a Google Sheets)
  3. Si no existe, llama a Google Sheets, guarda el resultado en archivo y en memoria
- **Garbage collection:** No implementado (los archivos persisten indefinidamente)

### 7.2 Cache en Memoria (Map de Node.js)
- Los datos cargados se mantienen en un `Map` para acceso rápido durante la sesión

### 7.3 Cache Frontend (búsqueda local)
- Al primer focus en un campo de catálogo, se descarga `GET /:nombre/completo`
- Se almacena en `catalogosLocal[nombre]` en el navegador
- Se construye un **Trie** para búsqueda O(1) por prefijo
- La búsqueda es 100% local, sin llamadas al servidor

## 8. Autocomplete (Trie)

**Estructura:**
```javascript
class TrieNode {
  children: {}       // { 'a': TrieNode, 'b': TrieNode, ... }
  resultados: []     // Hasta 10 items con este prefijo
}
```

**Inserción:**
- Cada código de procedimiento se inserta completo
- Hasta 5 palabras clave de la descripción (longitud >= 3) se insertan
- Cada nodo almacena hasta 10 resultados para ese prefijo

**Búsqueda:**
- Recorre el Trie carácter por carácter
- Retorna `resultados` del nodo final (máximo 5)
- Complejidad: O(longitud del query) en vez de O(n)

**Configuración:**
- Debounce: 200ms (búsqueda local, no necesita esperar al servidor)
- Resultados máximos: 5
- Navegación: ↑↓ para moverse, Enter para seleccionar, Escape para cerrar

## 9. Variables de Entorno (.env)

```env
PORT=3000
GOOGLE_SERVICE_ACCOUNT_PATH=../credentials.json

SHEET_CATALOGOS=1OlGJSpicBBp9oACtsc9WgYFBfIVuO8gi-dzrYv8M0PU
SHEET_HOSPITALIZACION=1gIhW51vVd_IEUM38CtyxdMg2v9PsWcDkNgiurviSGP8
SHEET_EMERGENCIA=1kBDtv1bhPHKQiJW6cR-heAv2Y5YlmOpq_7fJyBTSB6E

SHEET_HOSP_HOJAS=IESS-G-HOS,IESS-C-HOS,SPPAT-HOS,ISSPOL-HOS,ISSFA-HOS
SHEET_EMERG_HOJAS=IESS-G-EMERG,IESS-C-EMERG,SPPAT-EMERG,ISSPOL-EMERG,ISSFA-EMERG
SHEET_CAT_HOJAS=Procedimientos,Diagnosticos,Medicamentos,Beneficiario,Dependencia,TipoExamen,Intrahospital
CACHE_REFRESH_MINUTOS=30
```

**credentials.json** — Cuenta de servicio Google con permisos de Editor en los 3 sheets.
- `type: service_account`
- `project_id: msp-recuperacion-costos`
- `client_email: msp-backend@msp-recuperacion-costos.iam.gserviceaccount.com`

## 10. Diseño Visual

| Elemento | Color | Hex |
|---|---|---|
| Header/sidebar principal | Azul oscuro | `#1a2a3a` |
| Acento Emergencia | Rojo | `#c0392b` |
| Acento Hospitalización | Azul medio | `#2c6faa` |
| Fondo general | Gris claro | `#f5f6fa` |
| Botón Guardar | Verde | `#27ae60` |
| Texto principal | Gris oscuro | `#2f3640` |

## 11. Dependencias

**backend/package.json:**
```json
{
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "express-rate-limit": "^7.5.0",
    "googleapis": "^144.0.0"
  }
}
```

Para instalar: `cd backend && npm install`

## 12. Cómo Iniciar

```bash
# 1. Asegurar que credentials.json está en /Planillaje/
# 2. Asegurar que los 3 sheets están compartidos con la cuenta de servicio como EDITOR
# 3. Iniciar servidor
cd backend
npm start
# 4. Abrir navegador en http://localhost:3000
```

## 13. Limitaciones Conocidas

1. **Google Sheets API tiene un límite de 100 solicitudes por 100 segundos por proyecto** — El rate limiting interno (50-200/min) ayuda pero no controla el quota de Google.
2. **No hay paginación en la tabla de registros** — Muestra máximo 15.
3. **No hay sistema de autenticación de usuarios** — Acceso libre a todas las funciones.
4. **No hay logging estructurado** — Solo console.log.
5. **El cache de archivos no se refresca automáticamente** — Solo se crea al primer acceso. Para refrescar, borrar archivos en `backend/cache/`.
6. **No hay manejo de errores de red en frontend** — Si el servidor está caído, el usuario ve "Sin conexión" pero no hay reconexión automática.
7. **Las columnas varían entre hojas** — SPPAT tiene 54 columnas (vs 35 de las otras) porque incluye datos de accidente de tránsito. ISSPOL tiene columna PORCENTAJE extra.

## 14. Flujo del Usuario

1. Abre http://localhost:3000 → Ve pantalla de bienvenida
2. Sidebar: Emergencia (🚑 rojo) | Hospitalización (🏨 azul)
3. Expande un módulo → Selecciona una hoja (IESS-G-EMERG, SPPAT-HOS, etc.)
4. Se carga el formulario con campos agrupados por secciones
5. En campos de catálogo: escribe ≥2 caracteres → dropdown aparece con 5 resultados → selecciona
6. EDAD se calcula automáticamente al ingresar fecha de nacimiento + fecha de ingreso
7. Si PARENTESCO = T, se copian datos del titular automáticamente
8. Para SPPAT: DEPENDENCIA y TIPO BENEFICIARIO se fijan automáticamente (deshabilitados)
9. Guardar → POST al backend → escribe en Google Sheets
10. Abajo aparece la tabla de últimos 15 registros
11. ✏️ Editar: carga datos en formulario, cambia botón a "Actualizar"
12. 🗑️ Eliminar: confirma y borra la fila del sheet
