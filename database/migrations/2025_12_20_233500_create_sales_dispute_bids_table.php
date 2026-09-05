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
        Schema::create('sales_dispute_bids', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_dispute_id')
                ->constrained('sales_disputes')
                ->cascadeOnDelete();
            $table->foreignId('supplier_id')
                ->constrained('suppliers')
                ->cascadeOnDelete();
            $table->decimal('unit_cost', 12, 2)->nullable();
            $table->timestamps();

            $table->unique(['sales_dispute_id', 'supplier_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sales_dispute_bids');
    }
};
