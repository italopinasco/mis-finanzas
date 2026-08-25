MIS FINANZAS v6.6
- Movimientos vinculados directamente a cuentas mediante movimientos.cuenta_id.
- Ingresos y gastos nuevos guardan cuenta_id y el nombre de cuenta como respaldo.
- El Dashboard calcula saldos por cuenta usando cuenta_id.
- Los movimientos antiguos ya vinculados por SQL son reconocidos.
- Valida que moneda del movimiento y moneda de la cuenta coincidan.
- Mantiene transferencias, tipo de cambio SBS, Cron y modo manual.
