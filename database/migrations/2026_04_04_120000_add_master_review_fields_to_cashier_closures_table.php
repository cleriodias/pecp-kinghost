<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cashier_closures', function (Blueprint $table) {
            $table->decimal('master_cash_amount', 12, 2)->nullable()->after('card_amount');
            $table->decimal('master_card_amount', 12, 2)->nullable()->after('master_cash_amount');
            $table->foreignId('master_checked_by')->nullable()->after('closed_at')->constrained('users')->nullOnDelete();
            $table->timestamp('master_checked_at')->nullable()->after('master_checked_by');
        });
    }

    public function down(): void
    {
        Schema::table('cashier_closures', function (Blueprint $table) {
            $table->dropForeign(['master_checked_by']);
            $table->dropColumn([
                'master_cash_amount',
                'master_card_amount',
                'master_checked_by',
                'master_checked_at',
            ]);
        });
    }
};
