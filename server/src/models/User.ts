import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type NonAttribute, type Sequelize } from 'sequelize';
import type { PlatformAccount } from './PlatformAccount.js';
import type { Content } from './Content.js';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare username: string;
  declare password: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare platformAccounts?: NonAttribute<PlatformAccount[]>;
  declare contents?: NonAttribute<Content[]>;

  static initModel(sequelize: Sequelize): typeof User {
    User.init(
      {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        username: { type: DataTypes.STRING(80), allowNull: false, unique: true },
        password: { type: DataTypes.STRING(255), allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'Users', modelName: 'User' },
    );
    return User;
  }
}
