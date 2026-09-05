<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('cashier_closures', function (Blueprint $table) {
            // ensure there is a standalone index for the FK on user_id
            $table->index('user_id', 'cashier_closures_user_id_idx');
        });

        // drop old unique (user_id, closed_date) safely
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE cashier_closures DROP INDEX cashier_closures_user_id_closed_date_unique');
        }

        Schema::table('cashier_closures', function (Blueprint $table) {
            // Add unique by user/unit/date
            $table->unique(['user_id', 'unit_id', 'closed_date'], 'cashier_closures_user_unit_date_unique');
        });
    }

    public function down(): void
    {
        Schema::table('cashier_closures', function (Blueprint $table) {
            $table->dropUnique('cashier_closures_user_unit_date_unique');
        });

        // restore old unique
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE cashier_closures ADD UNIQUE cashier_closures_user_id_closed_date_unique (user_id, closed_date)');
        }

        Schema::table('cashier_closures', function (Blueprint $table) {
            $table->dropIndex('cashier_closures_user_id_idx');
        });
    }
};
