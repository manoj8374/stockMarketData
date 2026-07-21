-- Stock candle data schema (multi-country, multi-source)
-- Target: MySQL 8+

CREATE TABLE IF NOT EXISTS countries (
    id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(3) NOT NULL UNIQUE,
    name        VARCHAR(50) NOT NULL,
    currency    VARCHAR(3) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exchanges (
    id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    country_id  SMALLINT UNSIGNED NOT NULL,
    code        VARCHAR(10) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    timezone    VARCHAR(50) NOT NULL,
    CONSTRAINT fk_exchanges_country FOREIGN KEY (country_id) REFERENCES countries(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS instruments (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    exchange_id     SMALLINT UNSIGNED NOT NULL,
    isin            VARCHAR(12),
    tradingsymbol   VARCHAR(50) NOT NULL,
    name            VARCHAR(200),
    instrument_type VARCHAR(20) NOT NULL,
    segment         VARCHAR(20),
    lot_size        INT NOT NULL DEFAULT 1,
    tick_size       DECIMAL(10,4) NOT NULL DEFAULT 0.05,
    expiry          DATE NULL,
    strike          DECIMAL(12,2) NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_instruments_exchange FOREIGN KEY (exchange_id) REFERENCES exchanges(id),
    CONSTRAINT uq_instruments UNIQUE (exchange_id, tradingsymbol, expiry, strike, instrument_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS data_sources (
    id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(30) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS instrument_source_map (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    instrument_id           BIGINT UNSIGNED NOT NULL,
    data_source_id          SMALLINT UNSIGNED NOT NULL,
    source_instrument_id    VARCHAR(50) NOT NULL,
    source_symbol           VARCHAR(50),
    is_active               TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_map_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id),
    CONSTRAINT fk_map_source FOREIGN KEY (data_source_id) REFERENCES data_sources(id),
    CONSTRAINT uq_map_source_token UNIQUE (data_source_id, source_instrument_id),
    CONSTRAINT uq_map_instrument_source UNIQUE (instrument_id, data_source_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS candles (
    instrument_id   BIGINT UNSIGNED NOT NULL,
    `interval`      VARCHAR(10) NOT NULL,
    ts              DATETIME NOT NULL,
    open            DECIMAL(14,4) NOT NULL,
    high            DECIMAL(14,4) NOT NULL,
    low             DECIMAL(14,4) NOT NULL,
    close           DECIMAL(14,4) NOT NULL,
    volume          BIGINT NOT NULL DEFAULT 0,
    oi              BIGINT NULL,
    data_source_id  SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (instrument_id, `interval`, ts),
    CONSTRAINT fk_candles_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id),
    CONSTRAINT fk_candles_source FOREIGN KEY (data_source_id) REFERENCES data_sources(id),
    KEY idx_candles_instrument_interval_ts (instrument_id, `interval`, ts DESC)
) ENGINE=InnoDB;

-- Seed data: India / NSE / BSE / Zerodha Kite
INSERT INTO countries (code, name, currency) VALUES
    ('IN', 'India', 'INR')
    ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO exchanges (country_id, code, name, timezone)
SELECT id, 'NSE', 'National Stock Exchange of India', 'Asia/Kolkata' FROM countries WHERE code = 'IN'
    ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO exchanges (country_id, code, name, timezone)
SELECT id, 'BSE', 'Bombay Stock Exchange', 'Asia/Kolkata' FROM countries WHERE code = 'IN'
    ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO data_sources (code, name) VALUES
    ('ZERODHA_KITE', 'Zerodha Kite Connect API')
    ON DUPLICATE KEY UPDATE name = VALUES(name);
