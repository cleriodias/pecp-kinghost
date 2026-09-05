<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tb33_dfe_distribuicao_controles')) {
            return;
        }

        Schema::create('tb33_dfe_distribuicao_controles', function (Blueprint $table) {
            $table->bigIncrements('tb33_id');
            $table->unsignedBigInteger('tb2_id')->nullable();
            $table->string('tb33_cnpj', 14);
            $table->string('tb33_ambiente', 20);
            $table->string('tb33_uf_autor', 2)->nullable();
            $table->string('tb33_ult_nsu', 15)->default('000000000000000');
            $table->string('tb33_max_nsu', 15)->default('000000000000000');
            $table->timestamp('tb33_ultima_consulta_em')->nullable();
            $table->string('tb33_ultimo_status', 10)->nullable();
            $table->text('tb33_ultima_mensagem')->nullable();
            $table->timestamps();

            $table
                ->foreign('tb2_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->nullOnDelete();

            $table->unique(['tb33_cnpj', 'tb33_ambiente'], 'tb33_cnpj_ambiente_unique');
            $table->index(['tb2_id', 'tb33_ambiente'], 'tb33_unidade_ambiente_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb33_dfe_distribuicao_controles');
    }
};
