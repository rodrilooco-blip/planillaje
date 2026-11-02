# Probar la nueva interfaz en local

1. Instala Node.js si todavía no está instalado.
2. Para guardar o consultar datos y usar los archivos de Drive, coloca credenciales de Google con permisos de Sheets y Drive como `credentials.json` en la carpeta raíz del proyecto. No las subas a GitHub. Sin ellas puedes probar el ingreso del médico, la navegación local y el mes que se muestra; las funciones de datos y Drive informarán que falta la conexión.
3. Ejecuta `iniciar.bat`. La primera vez instalará las dependencias y abrirá `http://localhost:3000`.
4. En la pantalla de ingreso escribe el apellido y nombre del médico. El nombre aparece en el encabezado y se completa en **Apellido y nombre del profesional** en los formularios.

Para hacer pruebas sin modificar planillas de trabajo, configura una carpeta y hojas de prueba separadas: el backend local escribe en las hojas de Google enlazadas. El mes local inicial no contiene archivos de Sheets enlazados.

El nombre del médico se conserva en la sesión del navegador. El botón de edición junto al nombre permite cambiarlo sin cerrar la aplicación.

La vista de registros incluye búsqueda, paginación, consulta de detalle, edición, impresión y eliminación. El número interno del paciente se mantiene oculto en la tabla y en las vistas de detalle e impresión. La exportación usa el mismo mes seleccionado en pantalla.
