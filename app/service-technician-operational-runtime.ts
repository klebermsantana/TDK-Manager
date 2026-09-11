import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const SERVICE_TECHNICIAN_SKILLS = [
  ["field_service", "Field Service"],
  ["infra_it", "Infraestrutura de TI"],
  ["network", "Redes corporativas"],
  ["wifi", "Wi-Fi"],
  ["fiber", "Fibra óptica"],
  ["cctv", "CFTV e Segurança"],
  ["structured_cabling", "Cabeamento estruturado"],
  ["data_center", "Data Center"],
  ["cybersecurity", "Cibersegurança"],
  ["iot", "IoT e Monitoramento"],
  ["telecom", "Telecomunicações"],
] as const;

export const SERVICE_TECHNICIAN_CERTIFICATES = ["NR10", "NR35", "ASO", "CNH", "CREA/CFT", "OUTRO"] as const;

export async function ensureServiceTechnicianOperationalTables() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_operational_profiles (
      technician_id INTEGER PRIMARY KEY,
      availability TEXT NOT NULL DEFAULT 'available',
      availability_until TEXT,
      base_city TEXT,
      base_state TEXT,
      service_radius_km REAL NOT NULL DEFAULT 50,
      region_mode TEXT NOT NULL DEFAULT 'preferred',
      work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
      work_start TEXT NOT NULL DEFAULT '08:00',
      work_end TEXT NOT NULL DEFAULT '18:00',
      own_vehicle INTEGER NOT NULL DEFAULT 0,
      vehicle_type TEXT,
      vehicle_plate TEXT,
      operational_notes TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_operational_availability ON service_technician_operational_profiles(availability, availability_until)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_operational_base ON service_technician_operational_profiles(base_state, base_city)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL,
      skill_code TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 2,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_service_technician_skill ON service_technician_skills(technician_id, skill_code)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_skill_code ON service_technician_skills(skill_code, active, level)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      match_text TEXT NOT NULL,
      coverage_mode TEXT NOT NULL DEFAULT 'preferred',
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_regions_tech ON service_technician_regions(technician_id, active)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_regions_mode ON service_technician_regions(coverage_mode, active)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL,
      certificate_type TEXT NOT NULL,
      document_number TEXT,
      issued_at TEXT,
      expires_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_certificates_tech ON service_technician_certificates(technician_id, active)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_certificates_type ON service_technician_certificates(certificate_type, expires_at, active)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_absences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL,
      absence_type TEXT NOT NULL DEFAULT 'unavailable',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      reason TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_absences_tech ON service_technician_absences(technician_id, active, starts_at, ends_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_absences_period ON service_technician_absences(starts_at, ends_at, active)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_operational_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      note TEXT,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_operational_audit_tech ON service_technician_operational_audit(technician_id, created_at)`));
}
