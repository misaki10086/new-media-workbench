import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type ForeignKey, type NonAttribute, type Sequelize } from 'sequelize';
import type { User } from './User.js';
import type { Content } from './Content.js';

export const PLATFORMS = ['wechat', 'douyin', 'xiaohongshu'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const ACCOUNT_STATUSES = ['active', 'expired'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export class PlatformAccount extends Model<InferAttributes<PlatformAccount>, InferCreationAttributes<PlatformAccount>> {
  declare id: CreationOptional<number>;
  declare platform: Platform;
  declare accountName: string;
  declare credential: string;
  declare externalId: CreationOptional<string | null>;
  declare accessToken: CreationOptional<string | null>;
  declare refreshToken: CreationOptional<string | null>;
  declare tokenExpiresAt: CreationOptional<Date | null>;
  declare status: CreationOptional<AccountStatus>;
  declare userId: ForeignKey<User['id']>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare user?: NonAttribute<User>;
  declare contents?: NonAttribute<Content[]>;

  static initModel(sequelize: Sequelize): typeof PlatformAccount {
    PlatformAccount.init(
      {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        platform: { type: DataTypes.ENUM(...PLATFORMS), allowNull: false },
        accountName: { type: DataTypes.STRING(120), allowNull: false },
        credential: { type: DataTypes.TEXT, allowNull: false },
        externalId: { type: DataTypes.STRING(255), allowNull: true },
        accessToken: { type: DataTypes.TEXT, allowNull: true },
        refreshToken: { type: DataTypes.TEXT, allowNull: true },
        tokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
        status: { type: DataTypes.ENUM(...ACCOUNT_STATUSES), allowNull: false, defaultValue: 'active' },
        userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'PlatformAccounts',
        modelName: 'PlatformAccount',
        indexes: [{ fields: ['userId'] }, { unique: true, fields: ['userId', 'platform', 'accountName'] }],
      },
    );
    return PlatformAccount;
  }
}
