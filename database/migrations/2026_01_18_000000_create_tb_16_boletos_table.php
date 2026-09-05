<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class () extends Migration {
    public function up(): void
    {
        Schema::create('tb_16_boletos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unit_id')
                ->nullable()
                ->constrained('tb2_unidades', 'tb2_id')
                ->nullOnDelete();
            $table->foreignId('user_id')
                ->constrained()
                ->cascadeOnDelete();
            $table->string('description', 255);
            $table->decimal('amount', 12, 2);
            $table->date('due_date');
            $table->string('barcode', 128);
            $table->string('digitable_line', 256);
            $table->boolean('is_paid')->default(false);
            $table->foreignId('paid_by')
                ->nullable()
                ->constrained('users', 'id')
                ->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb_16_boletos');
    }
};
