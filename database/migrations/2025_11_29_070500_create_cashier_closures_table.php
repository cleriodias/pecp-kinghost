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
        Schema::create('cashier_closures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('unit_id')->nullable();
            $table->string('unit_name')->nullable();
            $table->decimal('cash_amount', 12, 2);
            $table->decimal('card_amount', 12, 2);
            $table->date('closed_date');
            $table->timestamp('closed_at')->useCurrent();
            $table->timestamps();

            $table->unique(['user_id', 'closed_date']);
            $table->foreign('unit_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cashier_closures');
    }
};
