import { AppConfig } from './AppConfig';

export const appConfig: AppConfig = {
  isiaDBUrl: process.env.ISIADB_URL || `http://localhost:3100`,
};

