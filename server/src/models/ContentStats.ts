import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type ForeignKey, type NonAttribute, type Sequelize } from 'sequelize';
import type { Content } from './Content.js';
import type { PlatformAccount } from './PlatformAccount.js';

export class ContentStats extends Model<InferAttributes<ContentStats>, InferCreationAttributes<ContentStats>> {
  declare id: CreationOptional<number>;
  declare contentId: ForeignKey<Content['id']>;
  declare platformAccountId: ForeignKey<PlatformAccount['id']>;
  declare views: CreationOptional<number>;
  declare likes: CreationOptional<number>;
  declare comments: CreationOptional<number>;
  declare shares: CreationOptional<number>;
  declare recordedAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare content?: NonAttribute<Content>;
  declare platformAccount?: NonAttribute<PlatformAccount>;

  static initModel(sequelize: Sequelize): typeof ContentStats {
    ContentStats.init(
      {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        contentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        platformAccountId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        views: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        likes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        comments: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        shares: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        recordedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'ContentStats',
        modelName: 'ContentStats',
        indexes: [{ fields: ['contentId'] }, { fields: ['platformAccountId'] }],
      },
    );
    return ContentStats;
  }
}
