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
        Schema::create('tb2_unidades', function (Blueprint $table) {
            $table->bigIncrements('tb2_id');
            $table->string('tb2_nome');
            $table->string('tb2_endereco');
            $table->string('tb2_cep', 20);
            $table->string('tb2_fone', 20);
            $table->string('tb2_cnpj', 20);
            $table->string('tb2_localizacao', 512);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tb2_unidades');
    }
};
