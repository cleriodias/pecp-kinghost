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
        Schema::create('tb23_anydesck_codigos', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('unit_id');
            $table->string('code', 13)->unique();
            $table->string('type', 20);
            $table->timestamps();

            $table->foreign('unit_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->cascadeOnDelete();

            $table->index(['unit_id', 'type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tb23_anydesck_codigos');
    }
};
