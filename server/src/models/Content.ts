import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type ForeignKey, type NonAttribute, type Sequelize } from 'sequelize';
import type { User } from './User.js';
import type { PlatformAccount } from './PlatformAccount.js';
import type { PublishRecord } from './PublishRecord.js';
import type { ContentStats } from './ContentStats.js';

export const CONTENT_STATUSES = ['draft', 'published'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const CONTENT_TYPES = ['article', 'video'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export class Content extends Model<InferAttributes<Content>, InferCreationAttributes<Content>> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare body: string;
  declare coverUrl: string | null;
  declare tags: CreationOptional<string[]>;
  declare status: CreationOptional<ContentStatus>;
  declare scheduledAt: Date | null;
  declare contentType: CreationOptional<ContentType>;
  declare videoUrl: string | null;
  declare userId: ForeignKey<User['id']>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare user?: NonAttribute<User>;
  declare targetAccounts?: NonAttribute<PlatformAccount[]>;
  declare publishRecords?: NonAttribute<PublishRecord[]>;
  declare stats?: NonAttribute<ContentStats[]>;

  static initModel(sequelize: Sequelize): typeof Content {
    Content.init(
      {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        title: { type: DataTypes.STRING(255), allowNull: false },
        body: { type: DataTypes.TEXT('long'), allowNull: false },
        coverUrl: { type: DataTypes.STRING(2048), allowNull: true },
        tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
        status: { type: DataTypes.ENUM(...CONTENT_STATUSES), allowNull: false, defaultValue: 'draft' },
        scheduledAt: { type: DataTypes.DATE, allowNull: true },
        contentType: { type: DataTypes.ENUM(...CONTENT_TYPES), allowNull: false, defaultValue: 'article' },
        videoUrl: { type: DataTypes.STRING(2048), allowNull: true },
        userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'Contents', modelName: 'Content', indexes: [{ fields: ['userId'] }, { fields: ['status'] }] },
    );
    return Content;
  }
}
