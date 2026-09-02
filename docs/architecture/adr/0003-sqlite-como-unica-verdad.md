# ADR-0003 — SQLite (WAL) como única fuente de verdad

- **Estado:** aceptada (retro-documentada)
- **Vistas afectadas:** [contenedores](../containers.md), [modelo de datos](../data-model.md), [despliegue](../deployment.md), [proceso de ingesta](../process/ingesta-pedimento.md)

## Contexto

El dato aduanal es la evidencia con la que el operador se defiende ante una
glosa. Debe ser local, exportable, transaccional y auditable sin depender de
un servidor que alguien tenga que mantener encendido.

## Consecuencias

- Un archivo copiable es el respaldo. `database/backup.py` hace
  `wal_checkpoint(TRUNCATE)` antes de copiar: sin eso, el `-wal` se queda
  fuera y el respaldo pierde transacciones.
- Escritura concurrente limitada por diseño. Con un operador, no es un techo.
- Sin servidor que asegurar: la superficie de ataque de red desaparece.
- Las migraciones son idempotentes (`database/migrations.py`) porque la base
  del operador es de producción y no hay entorno de ensayo.
