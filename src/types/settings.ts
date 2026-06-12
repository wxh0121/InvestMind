import type { Currency, Market } from "./holding";

export interface DataSourceSettings {
  okxEnabled: boolean;
  yahooEnabled: boolean;
  eastmoneyEnabled: boolean;
}

export interface PortfolioSettings {
  baseCurrency: Currency;
  targetAllocationByMarket: Record<Market, number>;
  maxSingleAssetPercent: number;
  dataSources: DataSourceSettings;
}

export interface SettingRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

export const DEFAULT_TARGET_ALLOCATION: Record<Market, number> = {
  CASH: 10,
  US_STOCK: 30,
  CRYPTO: 15,
  A_SHARE: 20,
  HK_STOCK: 10,
  ASIA_PACIFIC: 10,
  EUROPE: 5
};

export const DEFAULT_SETTINGS: PortfolioSettings = {
  baseCurrency: "CNY",
  targetAllocationByMarket: DEFAULT_TARGET_ALLOCATION,
  maxSingleAssetPercent: 10,
  dataSources: {
    okxEnabled: true,
    yahooEnabled: true,
    eastmoneyEnabled: true
  }
};
