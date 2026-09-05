<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('sales_dispute_bids', function (Blueprint $table) {
            $table->timestamp('approved_at')->nullable()->after('unit_cost');
            $table->foreignId('approved_by')
                ->nullable()
                ->after('approved_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->text('invoice_note')->nullable()->after('approved_by');
            $table->string('invoice_file_path')->nullable()->after('invoice_note');
            $table->timestamp('invoiced_at')->nullable()->after('invoice_file_path');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sales_dispute_bids', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropColumn([
                'approved_at',
                'approved_by',
                'invoice_note',
                'invoice_file_path',
                'invoiced_at',
            ]);
        });
    }
};
