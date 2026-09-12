import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type ForeignKey, type NonAttribute, type Sequelize } from 'sequelize';
import type { Content } from './Content.js';
import type { PlatformAccount } from './PlatformAccount.js';

export const PUBLISH_STATUSES = ['pending', 'success', 'failed'] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

export class PublishRecord extends Model<InferAttributes<PublishRecord>, InferCreationAttributes<PublishRecord>> {
  declare id: CreationOptional<number>;
  declare contentId: ForeignKey<Content['id']>;
  declare platformAccountId: ForeignKey<PlatformAccount['id']>;
  declare status: CreationOptional<PublishStatus>;
  declare errorMessage: string | null;
  declare publishedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare content?: NonAttribute<Content>;
  declare platformAccount?: NonAttribute<PlatformAccount>;

  static initModel(sequelize: Sequelize): typeof PublishRecord {
    PublishRecord.init(
      {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        contentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        platformAccountId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        status: { type: DataTypes.ENUM(...PUBLISH_STATUSES), allowNull: false, defaultValue: 'pending' },
        errorMessage: { type: DataTypes.TEXT, allowNull: true },
        publishedAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'PublishRecords',
        modelName: 'PublishRecord',
        indexes: [{ fields: ['contentId'] }, { fields: ['platformAccountId'] }, { fields: ['status'] }],
      },
    );
    return PublishRecord;
  }
}
