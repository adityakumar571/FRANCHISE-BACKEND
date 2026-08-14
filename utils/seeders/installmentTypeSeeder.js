import { getInstallmentTypeModel } from "../../models/tenant/master/InstallmentType.model.js";

const INSTALLMENT_TYPES = [

  {
    name: "MONTHLY",
    isActive: true,
  },

  {
    name: "QUARTERLY",
    isActive: false,
  },

  {
    name: "CUSTOM_10",
    isActive: false,
  },

];

export const seedInstallmentTypes =
async (tenantDB) => {

  try {

    const InstallmentType =
      getInstallmentTypeModel(tenantDB);

    const exists =
      await InstallmentType.countDocuments();

    if (exists > 0) {

      console.log(
        "⚠️ Installment Types Already Exist"
      );

      return;
    }

    await InstallmentType.insertMany(
      INSTALLMENT_TYPES
    );

    console.log(
      "✅ Installment Types Seeded Successfully"
    );

  } catch (error) {

    console.log(
      "❌ Installment Seeder Error",
      error
    );

    throw error;
  }
};