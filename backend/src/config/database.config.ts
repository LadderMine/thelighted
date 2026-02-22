// backend/src/config/database.config.ts
import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'adetomi',
  database: process.env.DATABASE_NAME || 'restaurant',
  // entities: ['dist/**/*/entity.js'],
  entities: ['dist/**/*.entity.js'],
  // migrations: ['dist/database/migrations/*.js'],
  // synchronize: process.env.NODE_ENV === 'development',
  synchronize: true,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;

// backend/src/config/database.config.ts
// import { DataSource, DataSourceOptions } from 'typeorm';
// import { config } from 'dotenv';

// config();

// export const dataSourceOptions: DataSourceOptions = {
//   type: 'postgres',
//   host: process.env.DATABASE_HOST || 'localhost',
//   port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
//   username: process.env.DATABASE_USER || 'postgres',
//   password: process.env.DATABASE_PASSWORD || 'adetomi',
//   database: process.env.DATABASE_NAME || 'restaurant',
//   entities: ['dist/**/*.entity.js'],
//   migrations: ['dist/database/migrations/*.js'],
//   synchronize: process.env.NODE_ENV === 'development',
//   logging: process.env.NODE_ENV === 'development',
//   ssl:
//     process.env.NODE_ENV === 'production'
//       ? { rejectUnauthorized: false }
//       : false,
// };

// const dataSource = new DataSource(dataSourceOptions);

// export default dataSource;
