/**
 * Database schema, indices, and migrations.
 * Extracted from index.js for maintainability (#17).
 */

export function initializeDatabase(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // --- SCHEMA ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      path TEXT UNIQUE,
      mac_bookmark TEXT
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      is_collapsed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER,
      name TEXT,
      full_path TEXT UNIQUE,
      thumb_path TEXT,
      file_type TEXT,
      date_taken INTEGER,
      rating INTEGER DEFAULT 0,
      color_label TEXT DEFAULT '',
      gps_lat REAL,
      gps_lng REAL,
      gps_scanned INTEGER DEFAULT 0,
      FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      name TEXT,
      cover_path TEXT,
      sort_order INTEGER DEFAULT 0,
      project_id INTEGER,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(name, project_id)
    );
    CREATE TABLE IF NOT EXISTS album_images (
      album_id INTEGER, image_id INTEGER,
      PRIMARY KEY (album_id, image_id),
      FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
    );

    -- Feature 5: Tags & Ratings
    CREATE TABLE IF NOT EXISTS image_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
      UNIQUE(image_id, tag)
    );

    -- Feature 7: Face Detection / People
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT 'Unknown',
      sample_face_path TEXT,
      centroid TEXT
    );
    CREATE TABLE IF NOT EXISTS image_faces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id INTEGER NOT NULL,
      person_id INTEGER,
      x REAL, y REAL, width REAL, height REAL,
      descriptor TEXT,
      landmarks TEXT,
      match_score REAL,
      match_type TEXT,
      needs_review INTEGER DEFAULT 0,
      suggested_person_id INTEGER,
      FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL,
      FOREIGN KEY(suggested_person_id) REFERENCES people(id) ON DELETE SET NULL
    );

    -- Feature 6: Smart Albums
    CREATE TABLE IF NOT EXISTS smart_albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rules TEXT NOT NULL,
      match_all INTEGER DEFAULT 1,
      icon TEXT DEFAULT '🔍',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    -- Feature 12: Duplicate Detection
    CREATE TABLE IF NOT EXISTS image_hashes (
      image_id INTEGER PRIMARY KEY,
      phash TEXT,
      exact_hash TEXT,
      exact_quick_hash TEXT,
      file_size INTEGER,
      width INTEGER,
      height INTEGER,
      FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dismissed_duplicates (
      image_id_1 INTEGER NOT NULL,
      image_id_2 INTEGER NOT NULL,
      PRIMARY KEY (image_id_1, image_id_2),
      FOREIGN KEY(image_id_1) REFERENCES images(id) ON DELETE CASCADE,
      FOREIGN KEY(image_id_2) REFERENCES images(id) ON DELETE CASCADE
    );

    -- Feature 11: Edits
    CREATE TABLE IF NOT EXISTS image_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id INTEGER NOT NULL,
      edit_data TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      output_path TEXT,
      FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
    );

    -- Feature 15: Contextual Search (CLIP embedding-based)
    CREATE TABLE IF NOT EXISTS image_captions (
      image_id INTEGER PRIMARY KEY,
      captions TEXT NOT NULL,
      embedding TEXT,
      scanned_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dismissed_context_results (
      query_text TEXT NOT NULL,
      image_id INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (query_text, image_id),
      FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
    );
  `);

  // --- MIGRATION: Add rating, color_label, gps columns to images ---
  try {
    const cols = db.prepare("PRAGMA table_info(images)").all().map(c => c.name);
    if (!cols.includes('rating')) db.exec("ALTER TABLE images ADD COLUMN rating INTEGER DEFAULT 0");
    if (!cols.includes('color_label')) db.exec("ALTER TABLE images ADD COLUMN color_label TEXT DEFAULT ''");
    if (!cols.includes('gps_lat')) db.exec("ALTER TABLE images ADD COLUMN gps_lat REAL");
    if (!cols.includes('gps_lng')) db.exec("ALTER TABLE images ADD COLUMN gps_lng REAL");
    if (!cols.includes('gps_scanned')) db.exec("ALTER TABLE images ADD COLUMN gps_scanned INTEGER DEFAULT 0");
  } catch (e) { console.warn('[DB Migration] images columns:', e.message); }

  // --- MIGRATION: Add centroid column to people table ---
  try {
    const peopleCols = db.prepare("PRAGMA table_info(people)").all().map(c => c.name);
    if (!peopleCols.includes('centroid')) db.exec("ALTER TABLE people ADD COLUMN centroid TEXT");
  } catch (e) { console.warn('[DB Migration] people centroid:', e.message); }

  try {
    const folderCols = db.prepare("PRAGMA table_info(folders)").all().map(c => c.name);
    if (!folderCols.includes('mac_bookmark')) db.exec("ALTER TABLE folders ADD COLUMN mac_bookmark TEXT");
  } catch (e) { console.warn('[DB Migration] folders mac_bookmark:', e.message); }

  try {
    const smartAlbumCols = db.prepare("PRAGMA table_info(smart_albums)").all().map(c => c.name);
    if (!smartAlbumCols.includes('match_all')) db.exec("ALTER TABLE smart_albums ADD COLUMN match_all INTEGER DEFAULT 1");
  } catch (e) { console.warn('[DB Migration] smart_albums match_all:', e.message); }

  // --- MIGRATION: Add embedding column to image_captions ---
  try {
    const captionCols = db.prepare("PRAGMA table_info(image_captions)").all().map(c => c.name);
    if (!captionCols.includes('embedding')) {
      db.exec("ALTER TABLE image_captions ADD COLUMN embedding TEXT");
      // Old MobileNet captions are useless with CLIP — clear them to force rescan
      db.exec("DELETE FROM image_captions");
    }
  } catch (e) { console.warn('[DB Migration] image_captions embedding:', e.message); }

  // --- MIGRATION: Update albums table to allow same name in different projects ---
  try {
    const tableInfo = db.prepare("PRAGMA table_info(albums)").all();
    const indexList = db.prepare("PRAGMA index_list(albums)").all();

    const hasOldConstraint = indexList.some(idx =>
      idx.name.includes('autoindex') &&
      db.prepare(`PRAGMA index_info('${idx.name}')`).all().length === 1
    );

    if (hasOldConstraint && tableInfo.length > 0) {
      db.pragma('foreign_keys = OFF');

      db.exec(`
        BEGIN;
        CREATE TABLE IF NOT EXISTS albums_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT, 
          name TEXT,
          cover_path TEXT,
          sort_order INTEGER DEFAULT 0,
          project_id INTEGER,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          UNIQUE(name, project_id)
        );
        INSERT OR IGNORE INTO albums_new SELECT * FROM albums;
        DROP TABLE albums;
        ALTER TABLE albums_new RENAME TO albums;
        COMMIT;
      `);

      db.pragma('foreign_keys = ON');
    }
  } catch (e) {
    console.warn('[DB Migration] albums unique constraint:', e.message);
    db.pragma('foreign_keys = ON');
  }

  // --- MIGRATION: Remove CASCADE from image_edits so edits survive original image deletion ---
  try {
    const editCols = db.prepare("PRAGMA table_info(image_edits)").all().map(c => c.name);
    if (editCols.length > 0) {
      const imageIdCol = db.prepare("PRAGMA table_info(image_edits)").all().find(c => c.name === 'image_id');
      if (imageIdCol && imageIdCol.notnull === 1) {
        db.pragma('foreign_keys = OFF');
        db.exec(`
          BEGIN;
          CREATE TABLE IF NOT EXISTS image_edits_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_id INTEGER,
            edit_data TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            output_path TEXT
          );
          INSERT INTO image_edits_new SELECT * FROM image_edits;
          DROP TABLE image_edits;
          ALTER TABLE image_edits_new RENAME TO image_edits;
          COMMIT;
        `);
        db.pragma('foreign_keys = ON');
      }
    }
  } catch (e) {
    console.warn('[DB Migration] image_edits cascade:', e.message);
    db.pragma('foreign_keys = ON');
  }

  // --- MIGRATION: Add landmarks column to image_faces ---
  try {
    const faceCols = db.prepare("PRAGMA table_info(image_faces)").all().map(c => c.name);
    if (!faceCols.includes('landmarks')) db.exec("ALTER TABLE image_faces ADD COLUMN landmarks TEXT");
    if (!faceCols.includes('match_score')) db.exec("ALTER TABLE image_faces ADD COLUMN match_score REAL");
    if (!faceCols.includes('match_type')) db.exec("ALTER TABLE image_faces ADD COLUMN match_type TEXT");
    if (!faceCols.includes('needs_review')) db.exec("ALTER TABLE image_faces ADD COLUMN needs_review INTEGER DEFAULT 0");
    if (!faceCols.includes('suggested_person_id')) db.exec("ALTER TABLE image_faces ADD COLUMN suggested_person_id INTEGER");
  } catch (e) { console.warn('[DB Migration] image_faces landmarks:', e.message); }

  try {
    const hashCols = db.prepare("PRAGMA table_info(image_hashes)").all().map(c => c.name);
    if (!hashCols.includes('exact_hash')) db.exec("ALTER TABLE image_hashes ADD COLUMN exact_hash TEXT");
    if (!hashCols.includes('exact_quick_hash')) db.exec("ALTER TABLE image_hashes ADD COLUMN exact_quick_hash TEXT");
    if (!hashCols.includes('width')) db.exec("ALTER TABLE image_hashes ADD COLUMN width INTEGER");
    if (!hashCols.includes('height')) db.exec("ALTER TABLE image_hashes ADD COLUMN height INTEGER");
  } catch (e) { console.warn('[DB Migration] image_hashes dimensions:', e.message); }

  // --- Performance indices (must run AFTER migrations so columns like rating exist) ---
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_images_folder_id    ON images(folder_id);
    CREATE INDEX IF NOT EXISTS idx_images_date_taken    ON images(date_taken);
    CREATE INDEX IF NOT EXISTS idx_images_rating        ON images(rating);
    CREATE INDEX IF NOT EXISTS idx_images_file_type     ON images(file_type);
    CREATE INDEX IF NOT EXISTS idx_image_faces_person_id ON image_faces(person_id);
    CREATE INDEX IF NOT EXISTS idx_image_faces_image_id  ON image_faces(image_id);
    CREATE INDEX IF NOT EXISTS idx_image_faces_needs_review ON image_faces(needs_review);
    CREATE INDEX IF NOT EXISTS idx_image_faces_suggested_person_id ON image_faces(suggested_person_id);
    CREATE INDEX IF NOT EXISTS idx_image_tags_image_id   ON image_tags(image_id);
    CREATE INDEX IF NOT EXISTS idx_image_tags_tag        ON image_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_image_hashes_phash    ON image_hashes(phash);
    CREATE INDEX IF NOT EXISTS idx_image_hashes_exact_hash ON image_hashes(exact_hash);
    CREATE INDEX IF NOT EXISTS idx_albums_project_id     ON albums(project_id);
    CREATE INDEX IF NOT EXISTS idx_album_images_image_id ON album_images(image_id);
    CREATE INDEX IF NOT EXISTS idx_image_captions_image_id ON image_captions(image_id);
    CREATE INDEX IF NOT EXISTS idx_dismissed_context_results_query ON dismissed_context_results(query_text);
  `);
}
