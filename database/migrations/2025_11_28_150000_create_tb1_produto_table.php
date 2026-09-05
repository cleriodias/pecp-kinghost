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
        Schema::create('tb1_produto', function (Blueprint $table) {
            $table->bigIncrements('tb1_id');
            $table->string('tb1_nome', 45);
            $table->decimal('tb1_vlr_custo', 12, 2)->default(0);
            $table->decimal('tb1_vlr_venda', 12, 2)->default(0);
            $table->string('tb1_codbar', 64)->unique();
            $table->unsignedTinyInteger('tb1_tipo')->default(0);
            $table->unsignedTinyInteger('tb1_status')->default(1);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tb1_produto');
    }
};

