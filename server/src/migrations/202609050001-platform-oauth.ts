import { DataTypes, type QueryInterface } from 'sequelize';

export const platformOauth = {
  name: '202609050001-platform-oauth',
  async up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
    await queryInterface.addColumn('PlatformAccounts', 'externalId', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('PlatformAccounts', 'accessToken', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('PlatformAccounts', 'refreshToken', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('PlatformAccounts', 'tokenExpiresAt', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  },

  async down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
    await queryInterface.removeColumn('PlatformAccounts', 'tokenExpiresAt');
    await queryInterface.removeColumn('PlatformAccounts', 'refreshToken');
    await queryInterface.removeColumn('PlatformAccounts', 'accessToken');
    await queryInterface.removeColumn('PlatformAccounts', 'externalId');
  },
};
