<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tb32_tipo_produto', function (Blueprint $table) {
            $table->bigIncrements('tb32_id');
            $table->string('tb32_nome', 50)->unique();
            $table->string('tb32_ncm', 8);
            $table->timestamps();
        });

        Schema::table('tb1_produto', function (Blueprint $table) {
            $table->unsignedBigInteger('tb32_id')->nullable()->after('tb1_tipo');
            $table->foreign('tb32_id')
                ->references('tb32_id')
                ->on('tb32_tipo_produto')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tb1_produto', function (Blueprint $table) {
            $table->dropForeign(['tb32_id']);
            $table->dropColumn('tb32_id');
        });

        Schema::dropIfExists('tb32_tipo_produto');
    }
};
