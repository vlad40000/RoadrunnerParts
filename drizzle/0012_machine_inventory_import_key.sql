CREATE UNIQUE INDEX IF NOT EXISTS machine_inventory_machine_code_uidx
  ON machine_inventory (machine_code)
  WHERE machine_code IS NOT NULL;
