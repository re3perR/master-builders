import { createAdminClient } from "./admin";

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("Использование: npm run user:password -- <email> <новый пароль>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Пароль должен быть не короче 8 символов.");
  process.exit(1);
}

const admin = createAdminClient();

async function main() {
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
      if (updateError) throw updateError;
      console.log(`Пароль для ${email} обновлён.`);
      return;
    }
    if (data.users.length < 200) break;
  }
  console.error(`Пользователь ${email} не найден.`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
